import React, { useState, useEffect } from 'react';
import { 
  Calendar, 
  Plus, 
  Edit3, 
  Trash2, 
  Save, 
  X, 
  CheckCircle, 
  AlertCircle, 
  Loader2, 
  RefreshCw,
  Clock,
  CalendarDays,
  School,
  BookOpen,
  ChevronRight,
  Calendar as CalendarIcon
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import api, {API_BASE_URL}  from '@/services/api';

// TypeScript interfaces
interface AcademicSession {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
  is_active: boolean;
  created_at: string;
}

interface Term {
  id: string;
  term_type_id: number;  // ✅ add this
  name: string;          // still works via backend @property
  academic_session: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
  is_active: boolean;
  next_term_begins?: string;
  holidays_start?: string;
  holidays_end?: string;
  created_at: string;
}

interface CreateSessionData {
  name: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
}

interface CreateTermData {
  term_type_id: number | string;
  academic_session: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
  next_term_begins?: string;  
  holidays_start?: string;
  holidays_end?: string;
}


interface TermType {
  id: number;
  name: string;
  code: string;
  display_order: number;
  is_active: boolean;
}

const AcademicCalendarTab: React.FC = () => {
  const [activeSection, setActiveSection] = useState<string>('sessions');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Data state
  const [sessions, setSessions] = useState<AcademicSession[]>([]);
  const [terms, setTerms] = useState<Term[]>([]);
  const [currentSession, setCurrentSession] = useState<AcademicSession | null>(null);
  const [currentTerm, setCurrentTerm] = useState<Term | null>(null);
  const [termTypes, setTermTypes] = useState<TermType[]>([]);

  // Form states
  const [showSessionForm, setShowSessionForm] = useState(false);
  const [showTermForm, setShowTermForm] = useState(false);
  const [editingSession, setEditingSession] = useState<string | null>(null);
  const [editingTerm, setEditingTerm] = useState<string | null>(null);

  // Form data
  const [sessionForm, setSessionForm] = useState<CreateSessionData>({
    name: '',
    start_date: '',
    end_date: '',
    is_current: false
  });

  const [termForm, setTermForm] = useState<CreateTermData>({
    term_type_id: '',
    academic_session: '',
    start_date: '',
    end_date: '',
    is_current: false,

  });

  const getTenantId = (): string | null => {
    try {
      const userStr = localStorage.getItem('userData');
      if (!userStr) {
        console.warn('No user data found in localStorage');
        return null;
      }
      
      const user = JSON.parse(userStr);
      const tenantId = user?.tenant_id;
      
      if (!tenantId) {
        console.warn('No tenant ID found in user data:', user);
      }
      
      return tenantId || null;
    } catch (error) {
      console.error('Error getting tenant ID:', error);
      return null;
    }
  };

  const getHeaders = (includeContentType = false): HeadersInit => {
   
    const tenantId = getTenantId();
    
    const headers: HeadersInit = {};

    // Add tenant header if available
    if (tenantId) {
      headers['X-Tenant-ID'] = tenantId;
    } else {
      console.warn('⚠️ No tenant ID available - request may fail');
    }

    if (includeContentType) {
      headers['Content-Type'] = 'application/json';
    }

    return headers;
  };
  


  const fetchTermTypes = async (): Promise<TermType[]> => {
  try {
    const response = await fetch(`${API_BASE_URL}/academics/term-types/`, {
      headers: getHeaders(),
      credentials: 'include',
    });
    if (response.ok) return await response.json();
    console.error('Failed to fetch term types:', response.status);
    return [];
  } catch (error) {
    console.error('Error fetching term types:', error);
    return [];
  }
};

const loadData = async () => {
  try {
    setLoading(true);
    const [sessionsData, termsData, termTypesData] = await Promise.all([
      fetchSessions(),
      fetchTerms(),
      fetchTermTypes(),  // ✅ add this
    ]);
    setSessions(sessionsData);
    setTerms(termsData);
    setTermTypes(termTypesData);  // ✅ add this
    setCurrentSession(sessionsData.find(s => s.is_current) || null);
    setCurrentTerm(termsData.find(t => t.is_current) || null);
  } catch (error) {
    console.error('Error loading academic calendar data:', error);
    toast.error('Failed to load academic calendar data');
  } finally {
    setLoading(false);
  }
};
      
// Load data
  useEffect(() => {
    loadData();
  }, []);


  const fetchSessions = async (): Promise<AcademicSession[]> => {
    try {
      const response = await fetch(`${API_BASE_URL}/academics/sessions/`, {
        headers: getHeaders(), // **FIX: Using new helper with tenant header**
        credentials: 'include'
      });

      if (response.ok) {
        return await response.json();
      } else {
        const errorText = await response.text();
        console.error('Failed to fetch sessions:', response.status, errorText);
        throw new Error('Failed to fetch sessions');
      }
    } catch (error) {
      console.error('Error fetching sessions:', error);
      return [];
    }
  };

  const fetchTerms = async (): Promise<Term[]> => {
    try {
      const response = await fetch(`${API_BASE_URL}/academics/terms/`, {
        headers: getHeaders(), // **FIX: Using new helper with tenant header**
        credentials: 'include'
      });

      if (response.ok) {
        return await response.json();
      } else {
        const errorText = await response.text();
        console.error('Failed to fetch terms:', response.status, errorText);
        throw new Error('Failed to fetch terms');
      }
    } catch (error) {
      console.error('Error fetching terms:', error);
      return [];
    }
  };
  // Session management
  const handleCreateSession = async () => {
    try {
      setSaving(true);
      
      // Validate form data
      if (!sessionForm.name || !sessionForm.start_date || !sessionForm.end_date) {
        toast.error('Please fill in all required fields');
        return;
      }

      // Validate dates
      const startDate = new Date(sessionForm.start_date);
      const endDate = new Date(sessionForm.end_date);
      
      if (startDate >= endDate) {
        toast.error('Start date must be before end date');
        return;
      }

      const response = await fetch(`${API_BASE_URL}/academics/sessions/`, {
        method: 'POST',
        headers: getHeaders(true), // **FIX: Using new helper with tenant header**
        body: JSON.stringify(sessionForm),
        credentials: 'include'
      });

      if (response.ok) {
        toast.success('Academic session created successfully');
        setShowSessionForm(false);
        setSessionForm({ name: '', start_date: '', end_date: '', is_current: false });
        await loadData();
      } else {
        const errorData = await response.json();
        console.error('Session creation error:', errorData);
        if (errorData.non_field_errors) {
          toast.error(errorData.non_field_errors[0]);
        } else if (errorData.message) {
          toast.error(errorData.message);
        } else {
          toast.error('Failed to create session. Please check your input.');
        }
      }
    } catch (error) {
      console.error('Error creating session:', error);
      toast.error('Failed to create session');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateSession = async (sessionId: string) => {
    try {
      setSaving(true);
      
      // Validate form data
      if (!sessionForm.name || !sessionForm.start_date || !sessionForm.end_date) {
        toast.error('Please fill in all required fields');
        return;
      }

      // Validate dates
      const startDate = new Date(sessionForm.start_date);
      const endDate = new Date(sessionForm.end_date);
      
      if (startDate >= endDate) {
        toast.error('Start date must be before end date');
        return;
      }

      const response = await fetch(`${API_BASE_URL}/academics/sessions/${sessionId}/`, {
        method: 'PUT',
        headers: getHeaders(true), // **FIX: Using new helper with tenant header**
        body: JSON.stringify(sessionForm),
        credentials: 'include'
      });

      if (response.ok) {
        toast.success('Academic session updated successfully');
        setShowSessionForm(false);
        setEditingSession(null);
        setSessionForm({ name: '', start_date: '', end_date: '', is_current: false });
        await loadData();
      } else {
        const errorData = await response.json();
        if (errorData.non_field_errors) {
          toast.error(errorData.non_field_errors[0]);
        } else if (errorData.message) {
          toast.error(errorData.message);
        } else {
          toast.error('Failed to update session. Please check your input.');
        }
      }
    } catch (error) {
      console.error('Error updating session:', error);
      toast.error('Failed to update session');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    if (!confirm('Are you sure you want to delete this academic session? This will also delete all associated terms.')) {
      return;
    }

    try {
      setSaving(true);
      
      const response = await fetch(`${API_BASE_URL}/academics/sessions/${sessionId}/`, {
        method: 'DELETE',
        headers: getHeaders(), // **FIX: Using new helper with tenant header**
        credentials: 'include'
      });

      if (response.ok) {
        toast.success('Academic session deleted successfully');
        await loadData();
      } else {
        toast.error('Failed to delete session');
      }
    } catch (error) {
      console.error('Error deleting session:', error);
      toast.error('Failed to delete session');
    } finally {
      setSaving(false);
    }
  };

  const handleSetCurrentSession = async (sessionId: string) => {
    try {
      setSaving(true);
      
      const response = await fetch(`${API_BASE_URL}/academics/sessions/${sessionId}/set_active/`, {
        method: 'POST',
        headers: getHeaders(),
        credentials: 'include'
      });

      if (response.ok) {
        toast.success('Current session updated successfully');
        await loadData();
      } else {
        toast.error('Failed to update current session');
      }
    } catch (error) {
      console.error('Error setting current session:', error);
      toast.error('Failed to update current session');
    } finally {
      setSaving(false);
    }
  };

  // Term management
  const handleCreateTerm = async () => {
    try {
      setSaving(true);
      
      // Validate form data
      if (!termForm.term_type_id || !termForm.academic_session || !termForm.start_date || !termForm.end_date) {
        toast.error('Please fill in all required fields');
        return;
      }

      // Validate dates
      const startDate = new Date(termForm.start_date);
      const endDate = new Date(termForm.end_date);
      
      if (startDate >= endDate) {
        toast.error('Start date must be before end date');
        return;
      }

      // Get the selected academic session to validate dates
      const selectedSession = sessions.find(s => s.id === termForm.academic_session);
      if (selectedSession) {
        const sessionStart = new Date(selectedSession.start_date);
        const sessionEnd = new Date(selectedSession.end_date);
        
        console.log('Term dates:', { startDate: termForm.start_date, endDate: termForm.end_date });
        console.log('Session dates:', { sessionStart: selectedSession.start_date, sessionEnd: selectedSession.end_date });
        
        if (startDate < sessionStart) {
          toast.error(`Term start date (${termForm.start_date}) cannot be before the session start date (${selectedSession.start_date})`);
          return;
        }
        
        if (endDate > sessionEnd) {
          toast.error(`Term end date (${termForm.end_date}) cannot be after the session end date (${selectedSession.end_date})`);
          return;
        }
      }

      // Ensure academic_session is sent as a number
      const payload = {
          term_type_id: Number(termForm.term_type_id),  // ✅ replaces 'name'
          academic_session: Number(termForm.academic_session),
          start_date: termForm.start_date,
          end_date: termForm.end_date,
          is_current: termForm.is_current,
          ...(termForm.next_term_begins && { next_term_begins: termForm.next_term_begins }),
          ...(termForm.holidays_start && { holidays_start: termForm.holidays_start }),
          ...(termForm.holidays_end && { holidays_end: termForm.holidays_end }),
        };
      
      console.log('Sending term data:', payload);
      
      const response = await fetch(`${API_BASE_URL}/academics/terms/`, {
        method: 'POST',
        headers: getHeaders(true), // **FIX: Using new helper with tenant header**
        body: JSON.stringify(payload),
        credentials: 'include'
      });

      if (response.ok) {
        toast.success('Term created successfully');
        setShowTermForm(false);
        setTermForm({ term_type_id: '', academic_session: '', start_date: '', end_date: '', is_current: false });
        await loadData();
      } else {
        const errorData = await response.json();
        console.error('Term creation error:', errorData);
        if (errorData.non_field_errors) {
          toast.error(errorData.non_field_errors[0]);
        } else if (errorData.message) {
          toast.error(errorData.message);
        } else {
          toast.error('Failed to create term. Please check your input.');
        }
      }
    } catch (error) {
      console.error('Error creating term:', error);
      toast.error('Failed to create term');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateTerm = async (termId: string) => {
  try {
    setSaving(true);

    if (!termForm.term_type_id || !termForm.academic_session || !termForm.start_date || !termForm.end_date) {
      toast.error('Please fill in all required fields');
      return;
    }

    const startDate = new Date(termForm.start_date);
    const endDate = new Date(termForm.end_date);

    if (startDate >= endDate) {
      toast.error('Start date must be before end date');
      return;
    }

    const selectedSession = sessions.find(s => s.id === termForm.academic_session);
    if (selectedSession) {
      const sessionStart = new Date(selectedSession.start_date);
      const sessionEnd = new Date(selectedSession.end_date);
      if (startDate < sessionStart || endDate > sessionEnd) {
        toast.error('Term dates must be within the academic session dates');
        return;
      }
    }

    // Fix: cast academic_session to number, strip undefined optional fields
    const payload = {
  term_type_id: Number(termForm.term_type_id),  // ✅ replaces 'name'
  academic_session: Number(termForm.academic_session),
  start_date: termForm.start_date,
  end_date: termForm.end_date,
  is_current: termForm.is_current,
  ...(termForm.next_term_begins && { next_term_begins: termForm.next_term_begins }),
  ...(termForm.holidays_start && { holidays_start: termForm.holidays_start }),
  ...(termForm.holidays_end && { holidays_end: termForm.holidays_end }),
};

    const response = await fetch(`${API_BASE_URL}/academics/terms/${termId}/`, {
      method: 'PATCH',
      headers: getHeaders(true),
      body: JSON.stringify(payload),
      credentials: 'include'
    });

    if (response.ok) {
      toast.success('Term updated successfully');
      setShowTermForm(false);
      setEditingTerm(null);
      setTermForm({ term_type_id: '', academic_session: '', start_date: '', end_date: '', is_current: false });
      await loadData();
    } else {
      const errorData = await response.json();
      console.error('Term update error:', errorData);
      console.error('Term update error FULL:', JSON.stringify(errorData, null, 2));
      const msg = errorData.non_field_errors?.[0] || errorData.message || JSON.stringify(errorData);
      toast.error(`Failed to update term: ${msg}`);
    }
  } catch (error) {
    console.error('Error updating term:', error);
    toast.error('Failed to update term');
  } finally {
    setSaving(false);
  }
};

  const handleDeleteTerm = async (termId: string) => {
    if (!confirm('Are you sure you want to delete this term?')) {
      return;
    }

    try {
      setSaving(true);
      
      const response = await fetch(`${API_BASE_URL}/academics/terms/${termId}/`, {
        method: 'DELETE',
        headers: getHeaders(), // **FIX: Using new helper with tenant header**
        credentials: 'include'
      });

      if (response.ok) {
        toast.success('Term deleted successfully');
        await loadData();
      } else {
        toast.error('Failed to delete term');
      }
    } catch (error) {
      console.error('Error deleting term:', error);
      toast.error('Failed to delete term');
    } finally {
      setSaving(false);
    }
  };

 const handleSetCurrentTerm = async (termId: string) => {
    try {
      setSaving(true);
      
      const response = await fetch(`${API_BASE_URL}/academics/terms/${termId}/set_current/`, {
        method: 'POST',
        headers: getHeaders(), // **FIX: Using new helper with tenant header**
        credentials: 'include'
      });

      if (response.ok) {
        toast.success('Current term updated successfully');
        await loadData();
      } else {
        toast.error('Failed to update current term');
      }
    } catch (error) {
      console.error('Error setting current term:', error);
      toast.error('Failed to update current term');
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getTermDisplayName = (termName: string) => {
    const termMap: { [key: string]: string } = {
      'FIRST': 'First Term',
      'SECOND': 'Second Term',
      'THIRD': 'Third Term'
    };
    return termMap[termName] || termName;
  };


  const getSuggestedTermDates = (sessionId: string, termName: string) => {
    const session = sessions.find(s => s.id === sessionId);
    if (!session) return { start_date: '', end_date: '' };

    const sessionStart = new Date(session.start_date);
    const sessionEnd = new Date(session.end_date);
    const sessionDuration = sessionEnd.getTime() - sessionStart.getTime();
    const termDuration = sessionDuration / 3; // Divide session into 3 terms

    let startDate, endDate;

    switch (termName) {
      case 'FIRST':
        startDate = new Date(sessionStart);
        endDate = new Date(sessionStart.getTime() + termDuration);
        break;
      case 'SECOND':
        startDate = new Date(sessionStart.getTime() + termDuration);
        endDate = new Date(sessionStart.getTime() + (termDuration * 2));
        break;
      case 'THIRD':
        startDate = new Date(sessionStart.getTime() + (termDuration * 2));
        endDate = new Date(sessionEnd);
        break;
      default:
        return { start_date: '', end_date: '' };
    }

    // Ensure dates are within session bounds
    if (startDate < sessionStart) startDate = new Date(sessionStart);
    if (endDate > sessionEnd) endDate = new Date(sessionEnd);

    // Format dates as YYYY-MM-DD for HTML date inputs
    const formatDateForInput = (date: Date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    return {
      start_date: formatDateForInput(startDate),
      end_date: formatDateForInput(endDate)
    };
  };

  // ── shared input / select classes ──────────────────────────────────────────
  const inputCls =
    'w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg bg-white text-gray-900 ' +
    'focus:outline-none focus:ring-2 focus:ring-black focus:border-black ' +
    'placeholder:text-gray-400 transition-colors';

  const labelCls = 'block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5';

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-3">
          <Loader2 className="animate-spin h-10 w-10 mx-auto text-black" />
          <p className="text-sm font-medium text-gray-700">Loading academic calendar…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 p-4 sm:p-6 bg-gray-50 min-h-screen">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 sm:p-7">
        {/* Title row */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-black rounded-lg shrink-0">
              <CalendarIcon className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 leading-tight">
                Academic Calendar
              </h1>
              <p className="text-sm text-gray-500 mt-0.5 hidden sm:block">
                Manage academic sessions and terms
              </p>
            </div>
          </div>
          <button
            onClick={loadData}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-black text-white text-sm font-semibold rounded-lg hover:bg-gray-800 active:bg-gray-900 transition-colors self-start sm:self-auto"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>

        {/* Status cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Current Session */}
          <div className="rounded-lg border border-gray-200 p-4 bg-gray-50">
            <div className="flex items-center gap-2 mb-3">
              <School className="w-4 h-4 text-gray-500 shrink-0" />
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Current Session</span>
            </div>
            {currentSession ? (
              <>
                <p className="text-lg font-bold text-gray-900 leading-tight">{currentSession.name}</p>
                <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {formatDate(currentSession.start_date)} – {formatDate(currentSession.end_date)}
                </p>
              </>
            ) : (
              <p className="text-sm text-gray-400 flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4" /> No current session set
              </p>
            )}
          </div>

          {/* Current Term */}
          <div className="rounded-lg border border-gray-200 p-4 bg-gray-50">
            <div className="flex items-center gap-2 mb-3">
              <CalendarDays className="w-4 h-4 text-gray-500 shrink-0" />
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Current Term</span>
            </div>
            {currentTerm ? (
              <>
                <p className="text-lg font-bold text-gray-900 leading-tight">
                  {getTermDisplayName(currentTerm.name)}
                </p>
                <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {formatDate(currentTerm.start_date)} – {formatDate(currentTerm.end_date)}
                </p>
              </>
            ) : (
              <p className="text-sm text-gray-400 flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4" /> No current term set
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── Navigation Tabs ─────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 p-1.5 flex gap-1.5">
        {(['sessions', 'terms'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveSection(tab)}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-semibold transition-colors ${
              activeSection === tab
                ? 'bg-black text-white'
                : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            {tab === 'sessions' ? <School className="w-4 h-4" /> : <CalendarDays className="w-4 h-4" />}
            <span>{tab === 'sessions' ? 'Academic Sessions' : 'Terms'}</span>
          </button>
        ))}
      </div>

      {/* ── Sessions Section ────────────────────────────────────────────────── */}
      {activeSection === 'sessions' && (
        <div className="bg-white rounded-xl border border-gray-200">
          {/* Section header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-5 sm:p-6 border-b border-gray-100">
            <div>
              <h2 className="text-base font-bold text-gray-900">Academic Sessions</h2>
              <p className="text-xs text-gray-500 mt-0.5">Manage your academic years</p>
            </div>
            <button
              onClick={() => setShowSessionForm(true)}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-black text-white text-sm font-semibold rounded-lg hover:bg-gray-800 transition-colors self-start sm:self-auto"
            >
              <Plus className="w-4 h-4" /> Add Session
            </button>
          </div>

          {/* Sessions list */}
          <div className="divide-y divide-gray-100">
            {sessions.length === 0 ? (
              <div className="text-center py-14 px-6">
                <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
                  <Calendar className="w-6 h-6 text-gray-400" />
                </div>
                <h3 className="text-sm font-semibold text-gray-900 mb-1">No sessions yet</h3>
                <p className="text-sm text-gray-500 mb-5 max-w-xs mx-auto">
                  Create your first academic session to start managing your school calendar.
                </p>
                <button
                  onClick={() => setShowSessionForm(true)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-black text-white text-sm font-semibold rounded-lg hover:bg-gray-800 transition-colors"
                >
                  <Plus className="w-4 h-4" /> Create Session
                </button>
              </div>
            ) : (
              sessions.map((session) => (
                <div key={session.id} className="p-4 sm:p-5 hover:bg-gray-50 transition-colors">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <h4 className="text-sm font-bold text-gray-900 truncate">{session.name}</h4>
                        {session.is_current && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold bg-black text-white rounded-full">
                            <CheckCircle className="w-3 h-3" /> Current
                          </span>
                        )}
                        {session.is_active && !session.is_current && (
                          <span className="px-2 py-0.5 text-xs font-semibold border border-gray-300 text-gray-600 rounded-full">
                            Active
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 flex items-center gap-1">
                        <Clock className="w-3 h-3 shrink-0" />
                        {formatDate(session.start_date)} – {formatDate(session.end_date)}
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 self-end sm:self-auto">
                      {!session.is_current && (
                        <button
                          onClick={() => handleSetCurrentSession(session.id)}
                          className="px-3 py-1.5 text-xs font-semibold border border-black text-black rounded-lg hover:bg-black hover:text-white transition-colors"
                        >
                          Set Current
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setEditingSession(session.id);
                          setSessionForm({
                            name: session.name,
                            start_date: session.start_date,
                            end_date: session.end_date,
                            is_current: session.is_current,
                          });
                          setShowSessionForm(true);
                        }}
                        className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                        title="Edit"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteSession(session.id)}
                        className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ── Terms Section ───────────────────────────────────────────────────── */}
      {activeSection === 'terms' && (
        <div className="bg-white rounded-xl border border-gray-200">
          {/* Section header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-5 sm:p-6 border-b border-gray-100">
            <div>
              <h2 className="text-base font-bold text-gray-900">Academic Terms</h2>
              <p className="text-xs text-gray-500 mt-0.5">Manage terms within your sessions</p>
            </div>
            <button
              onClick={() => setShowTermForm(true)}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-black text-white text-sm font-semibold rounded-lg hover:bg-gray-800 transition-colors self-start sm:self-auto"
            >
              <Plus className="w-4 h-4" /> Add Term
            </button>
          </div>

          {/* Terms list */}
          <div className="divide-y divide-gray-100">
            {terms.length === 0 ? (
              <div className="text-center py-14 px-6">
                <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
                  <BookOpen className="w-6 h-6 text-gray-400" />
                </div>
                <h3 className="text-sm font-semibold text-gray-900 mb-1">No terms yet</h3>
                <p className="text-sm text-gray-500 mb-5 max-w-xs mx-auto">
                  Create terms for your sessions to organise the school year.
                </p>
                <button
                  onClick={() => setShowTermForm(true)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-black text-white text-sm font-semibold rounded-lg hover:bg-gray-800 transition-colors"
                >
                  <Plus className="w-4 h-4" /> Create Term
                </button>
              </div>
            ) : (
              terms.map((term) => {
                const session = sessions.find((s) => s.id === term.academic_session);
                return (
                  <div key={term.id} className="p-4 sm:p-5 hover:bg-gray-50 transition-colors">
                    <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                      {/* Info */}
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="text-sm font-bold text-gray-900">{getTermDisplayName(term.name)}</h4>
                          {term.is_current && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold bg-black text-white rounded-full">
                              <CheckCircle className="w-3 h-3" /> Current
                            </span>
                          )}
                          {term.is_active && !term.is_current && (
                            <span className="px-2 py-0.5 text-xs font-semibold border border-gray-300 text-gray-600 rounded-full">
                              Active
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 flex items-center gap-1">
                          <Clock className="w-3 h-3 shrink-0" />
                          {formatDate(term.start_date)} – {formatDate(term.end_date)}
                        </p>
                        {session && (
                          <p className="text-xs text-gray-400 flex items-center gap-1">
                            <School className="w-3 h-3 shrink-0" /> {session.name}
                          </p>
                        )}
                        {term.next_term_begins && (
                          <p className="text-xs text-gray-400 flex items-center gap-1">
                            <ChevronRight className="w-3 h-3 shrink-0" />
                            Next term: {formatDate(term.next_term_begins)}
                          </p>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 self-end sm:self-start">
                        {!term.is_current && (
                          <button
                            onClick={() => handleSetCurrentTerm(term.id)}
                            className="px-3 py-1.5 text-xs font-semibold border border-black text-black rounded-lg hover:bg-black hover:text-white transition-colors"
                          >
                            Set Current
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setEditingTerm(term.id);
                            setTermForm({
                              term_type_id: term.term_type_id || '',
                              academic_session: term.academic_session,
                              start_date: term.start_date,
                              end_date: term.end_date,
                              is_current: term.is_current,
                              next_term_begins: term.next_term_begins,
                              holidays_start: term.holidays_start,
                              holidays_end: term.holidays_end,
                            });
                            setShowTermForm(true);
                          }}
                          className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                          title="Edit"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteTerm(term.id)}
                          className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ── Session Form Modal ──────────────────────────────────────────────── */}
      {showSessionForm && (
        <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-md sm:rounded-xl rounded-t-2xl shadow-2xl max-h-[92vh] overflow-y-auto">
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
              <div>
                <h3 className="text-base font-bold text-gray-900">
                  {editingSession ? 'Edit Session' : 'New Session'}
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {editingSession ? 'Update session details' : 'Create an academic session'}
                </p>
              </div>
              <button
                onClick={() => {
                  setShowSessionForm(false);
                  setEditingSession(null);
                  setSessionForm({ name: '', start_date: '', end_date: '', is_current: false });
                }}
                className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal body */}
            <div className="p-5 space-y-4">
              <div>
                <label className={labelCls}>Session Name</label>
                <input
                  type="text"
                  value={sessionForm.name}
                  onChange={(e) => setSessionForm({ ...sessionForm, name: e.target.value })}
                  placeholder="e.g., 2024/2025"
                  className={inputCls}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Start Date</label>
                  <input
                    type="date"
                    value={sessionForm.start_date}
                    onChange={(e) => setSessionForm({ ...sessionForm, start_date: e.target.value })}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>End Date</label>
                  <input
                    type="date"
                    value={sessionForm.end_date}
                    onChange={(e) => setSessionForm({ ...sessionForm, end_date: e.target.value })}
                    className={inputCls}
                  />
                </div>
              </div>
              <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                <input
                  type="checkbox"
                  id="is_current"
                  checked={sessionForm.is_current}
                  onChange={(e) => setSessionForm({ ...sessionForm, is_current: e.target.checked })}
                  className="w-4 h-4 rounded border-gray-300 accent-black"
                />
                <span className="text-sm font-medium text-gray-700">Set as current session</span>
              </label>
            </div>

            {/* Modal footer */}
            <div className="flex gap-3 px-5 py-4 border-t border-gray-100 sticky bottom-0 bg-white">
              <button
                onClick={() => {
                  setShowSessionForm(false);
                  setEditingSession(null);
                  setSessionForm({ name: '', start_date: '', end_date: '', is_current: false });
                }}
                className="flex-1 py-2.5 text-sm font-semibold border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => editingSession ? handleUpdateSession(editingSession) : handleCreateSession()}
                disabled={saving}
                className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 text-sm font-semibold bg-black text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {editingSession ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Term Form Modal ─────────────────────────────────────────────────── */}
      {showTermForm && (
        <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-md sm:rounded-xl rounded-t-2xl shadow-2xl max-h-[92vh] overflow-y-auto">
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
              <div>
                <h3 className="text-base font-bold text-gray-900">
                  {editingTerm ? 'Edit Term' : 'New Term'}
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {editingTerm ? 'Update term details' : 'Create an academic term'}
                </p>
              </div>
              <button
                onClick={() => {
                  setShowTermForm(false);
                  setEditingTerm(null);
                  setTermForm({ term_type_id: '', academic_session: '', start_date: '', end_date: '', is_current: false });
                }}
                className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal body */}
            <div className="p-5 space-y-4">
              <div>
                <label className={labelCls}>Term Type</label>
                <select
                  value={termForm.term_type_id || ''}
                  onChange={(e) => setTermForm({ ...termForm, term_type_id: e.target.value })}
                  className={inputCls}
                >
                  <option value="">Select term type</option>
                  {termTypes.map((tt) => (
                    <option key={tt.id} value={tt.id}>{tt.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className={labelCls}>Academic Session</label>
                <select
                  value={termForm.academic_session}
                  onChange={(e) => setTermForm({ ...termForm, academic_session: e.target.value })}
                  className={inputCls}
                >
                  <option value="">Select session</option>
                  {sessions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({formatDate(s.start_date)} – {formatDate(s.end_date)})
                    </option>
                  ))}
                </select>

                {termForm.academic_session && (
                  <div className="mt-2 p-3 bg-gray-50 border border-gray-200 rounded-lg space-y-2">
                    <p className="text-xs text-gray-500">
                      Session range:{' '}
                      <span className="font-semibold text-gray-700">
                        {(() => {
                          const sel = sessions.find((s) => s.id === termForm.academic_session);
                          return sel ? `${formatDate(sel.start_date)} – ${formatDate(sel.end_date)}` : '';
                        })()}
                      </span>
                    </p>
                    {termForm.academic_session && termForm.term_type_id && (
                      <button
                        type="button"
                        onClick={() => {
                          const termType = termTypes.find((tt) => tt.id === Number(termForm.term_type_id));
                          if (termType) {
                            const suggested = getSuggestedTermDates(termForm.academic_session, termType.code);
                            setTermForm((prev) => ({ ...prev, ...suggested }));
                          }
                        }}
                        className="w-full py-1.5 text-xs font-semibold border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
                      >
                        Use Suggested Dates
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Start Date</label>
                  <input
                    type="date"
                    value={termForm.start_date}
                    onChange={(e) => setTermForm({ ...termForm, start_date: e.target.value })}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>End Date</label>
                  <input
                    type="date"
                    value={termForm.end_date}
                    onChange={(e) => setTermForm({ ...termForm, end_date: e.target.value })}
                    className={inputCls}
                  />
                </div>
              </div>

              <div>
                <label className={labelCls}>Next Term Begins <span className="normal-case font-normal text-gray-400">(optional)</span></label>
                <input
                  type="date"
                  value={termForm.next_term_begins || ''}
                  onChange={(e) => setTermForm({ ...termForm, next_term_begins: e.target.value })}
                  className={inputCls}
                />
              </div>

              <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                <input
                  type="checkbox"
                  id="term_is_current"
                  checked={termForm.is_current}
                  onChange={(e) => setTermForm({ ...termForm, is_current: e.target.checked })}
                  className="w-4 h-4 rounded border-gray-300 accent-black"
                />
                <span className="text-sm font-medium text-gray-700">Set as current term</span>
              </label>
            </div>

            {/* Modal footer */}
            <div className="flex gap-3 px-5 py-4 border-t border-gray-100 sticky bottom-0 bg-white">
              <button
                onClick={() => {
                  setShowTermForm(false);
                  setEditingTerm(null);
                  setTermForm({ term_type_id: '', academic_session: '', start_date: '', end_date: '', is_current: false });
                }}
                className="flex-1 py-2.5 text-sm font-semibold border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => editingTerm ? handleUpdateTerm(editingTerm) : handleCreateTerm()}
                disabled={saving}
                className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 text-sm font-semibold bg-black text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {editingTerm ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AcademicCalendarTab;
