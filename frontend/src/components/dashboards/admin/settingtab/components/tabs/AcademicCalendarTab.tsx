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
  const [termTypes, setTermTypes] = useState<{id: number, name: string}[]>([]);

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
    const token = localStorage.getItem('authToken');
    const tenantId = getTenantId();
    
    const headers: HeadersInit = {
      'Authorization': `Bearer ${token}`,
    };

    // Add tenant header if available
    if (tenantId) {
      headers['X-Tenant-ID'] = tenantId;
      console.log('✅ Adding tenant header:', tenantId);
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
      headers: getHeaders()
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


const API_BASE_URL = import.meta.env.VITE_API_URL 

  const fetchSessions = async (): Promise<AcademicSession[]> => {
    try {
      const response = await fetch(`${API_BASE_URL}/academics/sessions/`, {
        headers: getHeaders() // **FIX: Using new helper with tenant header**
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
        headers: getHeaders() // **FIX: Using new helper with tenant header**
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
        body: JSON.stringify(sessionForm)
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
        body: JSON.stringify(sessionForm)
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
        headers: getHeaders() // **FIX: Using new helper with tenant header**
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
        headers: getHeaders() // **FIX: Using new helper with tenant header**
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
        body: JSON.stringify(payload)
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
      body: JSON.stringify(payload)
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
        headers: getHeaders() // **FIX: Using new helper with tenant header**
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
        headers: getHeaders() // **FIX: Using new helper with tenant header**
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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="animate-spin h-12 w-12 mx-auto text-blue-600 mb-4" />
          <p className="text-lg text-gray-600 dark:text-gray-400 font-medium">Loading academic calendar...</p>
          <p className="text-sm text-gray-500 dark:text-gray-500 mt-2">Please wait while we fetch your data</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 p-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Enhanced Header */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl">
              <CalendarIcon className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                Academic Calendar
              </h1>
              <p className="text-lg text-gray-600 dark:text-gray-400">
                Manage academic sessions and terms for your institution
              </p>
            </div>
          </div>
          <button
            onClick={loadData}
            className="flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl hover:from-blue-700 hover:to-blue-800 transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
          >
            <RefreshCw className="w-5 h-5" />
            <span className="font-semibold">Refresh</span>
          </button>
        </div>

        {/* Enhanced Current Status Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 rounded-xl p-6 border border-blue-200 dark:border-blue-700/50">
            <div className="flex items-center gap-4 mb-4">
              <div className="p-3 bg-blue-600 rounded-xl">
                <School className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">Current Session</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">Active academic year</p>
              </div>
            </div>
            {currentSession ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{currentSession.name}</p>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                  <Clock className="w-4 h-4" />
                  <span>{formatDate(currentSession.start_date)} - {formatDate(currentSession.end_date)}</span>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 text-gray-500 dark:text-gray-400">
                <AlertCircle className="w-5 h-5" />
                <p className="font-medium">No current session set</p>
              </div>
            )}
          </div>

          <div className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 rounded-xl p-6 border border-green-200 dark:border-green-700/50">
            <div className="flex items-center gap-4 mb-4">
              <div className="p-3 bg-green-600 rounded-xl">
                <CalendarDays className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">Current Term</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">Active academic term</p>
              </div>
            </div>
            {currentTerm ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                    {getTermDisplayName(currentTerm.name)}
                  </p>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                  <Clock className="w-4 h-4" />
                  <span>{formatDate(currentTerm.start_date)} - {formatDate(currentTerm.end_date)}</span>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 text-gray-500 dark:text-gray-400">
                <AlertCircle className="w-5 h-5" />
                <p className="font-medium">No current term set</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Enhanced Navigation Tabs */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-2">
        <div className="flex space-x-2">
          <button
            onClick={() => setActiveSection('sessions')}
            className={`flex-1 py-4 px-6 rounded-lg text-sm font-semibold transition-all duration-200 ${
              activeSection === 'sessions'
                ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-lg'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              <School className="w-5 h-5" />
              <span>Academic Sessions</span>
            </div>
          </button>
          <button
            onClick={() => setActiveSection('terms')}
            className={`flex-1 py-4 px-6 rounded-lg text-sm font-semibold transition-all duration-200 ${
              activeSection === 'terms'
                ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-lg'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              <CalendarDays className="w-5 h-5" />
              <span>Terms</span>
            </div>
          </button>
        </div>
      </div>

      {/* Enhanced Sessions Section */}
      {activeSection === 'sessions' && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-8">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Academic Sessions</h2>
              <p className="text-gray-600 dark:text-gray-400">Manage your academic years and sessions</p>
            </div>
            <button
              onClick={() => setShowSessionForm(true)}
              className="flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl hover:from-blue-700 hover:to-blue-800 transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
            >
              <Plus className="w-5 h-5" />
              <span className="font-semibold">Add Session</span>
            </button>
          </div>

          {/* Enhanced Sessions List */}
          <div className="space-y-4">
            {sessions.length === 0 ? (
              <div className="text-center py-12">
                <div className="p-4 bg-gray-100 dark:bg-gray-700 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                  <Calendar className="w-8 h-8 text-gray-400" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">No Sessions Found</h3>
                <p className="text-gray-600 dark:text-gray-400 mb-6">
                  Create your first academic session to get started with managing your school calendar.
                </p>
                <button
                  onClick={() => setShowSessionForm(true)}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Create First Session
                </button>
              </div>
            ) : (
              sessions.map((session) => (
                <div key={session.id} className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-6 border border-gray-200 dark:border-gray-600 hover:shadow-md transition-all duration-200">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-4 mb-3">
                        <h4 className="text-xl font-bold text-gray-900 dark:text-white">
                          {session.name}
                        </h4>
                        <div className="flex gap-2">
                          {session.is_current && (
                            <span className="px-3 py-1 text-xs font-semibold bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 rounded-full">
                              Current
                            </span>
                          )}
                          {session.is_active && (
                            <span className="px-3 py-1 text-xs font-semibold bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 rounded-full">
                              Active
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4" />
                          <span>{formatDate(session.start_date)} - {formatDate(session.end_date)}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {!session.is_current && (
                        <button
                          onClick={() => handleSetCurrentSession(session.id)}
                          className="px-4 py-2 text-sm font-semibold bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
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
                            is_current: session.is_current
                          });
                          setShowSessionForm(true);
                        }}
                        className="p-3 text-gray-600 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                      >
                        <Edit3 className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => handleDeleteSession(session.id)}
                        className="p-3 text-gray-600 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Enhanced Terms Section */}
      {activeSection === 'terms' && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-8">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Academic Terms</h2>
              <p className="text-gray-600 dark:text-gray-400">Manage terms within your academic sessions</p>
            </div>
            <button
              onClick={() => setShowTermForm(true)}
              className="flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl hover:from-blue-700 hover:to-blue-800 transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
            >
              <Plus className="w-5 h-5" />
              <span className="font-semibold">Add Term</span>
            </button>
          </div>

          {/* Enhanced Terms List */}
          <div className="space-y-4">
            {terms.length === 0 ? (
              <div className="text-center py-12">
                <div className="p-4 bg-gray-100 dark:bg-gray-700 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                  <BookOpen className="w-8 h-8 text-gray-400" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">No Terms Found</h3>
                <p className="text-gray-600 dark:text-gray-400 mb-6">
                  Create terms for your academic sessions to organize the school year.
                </p>
                <button
                  onClick={() => setShowTermForm(true)}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Create First Term
                </button>
              </div>
            ) : (
              terms.map((term) => {
                const session = sessions.find(s => s.id === term.academic_session);
                return (
                  <div key={term.id} className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-6 border border-gray-200 dark:border-gray-600 hover:shadow-md transition-all duration-200">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-4 mb-3">
                          <h4 className="text-xl font-bold text-gray-900 dark:text-white">
                            {getTermDisplayName(term.name)}
                          </h4>
                          <div className="flex gap-2">
                            {term.is_current && (
                              <span className="px-3 py-1 text-xs font-semibold bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 rounded-full">
                                Current
                              </span>
                            )}
                            {term.is_active && (
                              <span className="px-3 py-1 text-xs font-semibold bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 rounded-full">
                                Active
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                            <div className="flex items-center gap-2">
                              <Clock className="w-4 h-4" />
                              <span>{formatDate(term.start_date)} - {formatDate(term.end_date)}</span>
                            </div>
                          </div>
                          {session && (
                            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-500">
                              <School className="w-4 h-4" />
                              <span>Session: {session.name}</span>
                            </div>
                          )}
                          {term.next_term_begins && (
                            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-500">
                              <ChevronRight className="w-4 h-4" />
                              <span>Next term begins: {formatDate(term.next_term_begins)}</span>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {!term.is_current && (
                          <button
                            onClick={() => handleSetCurrentTerm(term.id)}
                            className="px-4 py-2 text-sm font-semibold bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                          >
                            Set Current
                          </button>
                        )}
                        <button
                          onClick={() => {
                          setEditingTerm(term.id);
                          setTermForm({
                            term_type_id: term.term_type_id || '',  // ✅ replaces term.name
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
                                                  
                          className="p-3 text-gray-600 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                        >
                          <Edit3 className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => handleDeleteTerm(term.id)}
                          className="p-3 text-gray-600 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-5 h-5" />
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

      {/* Enhanced Session Form Modal */}
      {showSessionForm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="p-8">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
                    {editingSession ? 'Edit Session' : 'Add New Session'}
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400 mt-1">
                    {editingSession ? 'Update the academic session details' : 'Create a new academic session'}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setShowSessionForm(false);
                    setEditingSession(null);
                    setSessionForm({ name: '', start_date: '', end_date: '', is_current: false });
                  }}
                  className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Session Name
                  </label>
                  <input
                    type="text"
                    value={sessionForm.name}
                    onChange={(e) => setSessionForm({ ...sessionForm, name: e.target.value })}
                    placeholder="e.g., 2024/2025"
                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white transition-all duration-200"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={sessionForm.start_date}
                    onChange={(e) => setSessionForm({ ...sessionForm, start_date: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white transition-all duration-200"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    End Date
                  </label>
                  <input
                    type="date"
                    value={sessionForm.end_date}
                    onChange={(e) => setSessionForm({ ...sessionForm, end_date: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white transition-all duration-200"
                  />
                </div>

                <div className="flex items-center p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
                  <input
                    type="checkbox"
                    id="is_current"
                    checked={sessionForm.is_current}
                    onChange={(e) => setSessionForm({ ...sessionForm, is_current: e.target.checked })}
                    className="w-5 h-5 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <label htmlFor="is_current" className="ml-3 text-sm font-medium text-gray-700 dark:text-gray-300">
                    Set as current session
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-4 mt-8">
                <button
                  onClick={() => {
                    setShowSessionForm(false);
                    setEditingSession(null);
                    setSessionForm({ name: '', start_date: '', end_date: '', is_current: false });
                  }}
                  className="px-6 py-3 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={() => editingSession ? handleUpdateSession(editingSession) : handleCreateSession()}
                  disabled={saving}
                  className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl hover:from-blue-700 hover:to-blue-800 transition-all duration-200 disabled:opacity-50 font-semibold"
                >
                  {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                  {editingSession ? 'Update Session' : 'Create Session'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Enhanced Term Form Modal */}
      {showTermForm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="p-8">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
                    {editingTerm ? 'Edit Term' : 'Add New Term'}
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400 mt-1">
                    {editingTerm ? 'Update the term details' : 'Create a new academic term'}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setShowTermForm(false);
                    setEditingTerm(null);
                    setTermForm({ term_type_id: '', academic_session: '', start_date: '', end_date: '', is_current: false });
                  }}
                  className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="space-y-6">
                 <div>
                      <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                        Term Type
                      </label>
                      <select
                        value={termForm.term_type_id || ''}
                        onChange={(e) => setTermForm({ ...termForm, term_type_id: e.target.value })}
                        className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                      >
                        <option value="">Select Term Type</option>
                        {termTypes.map((tt) => (
                          <option key={tt.id} value={tt.id}>{tt.name}</option>
                        ))}
                      </select>
                    </div>

                      <div>
                   <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                     Academic Session
                   </label>
                   <select
                     value={termForm.academic_session}
                     onChange={(e) => setTermForm({ ...termForm, academic_session: e.target.value })}
                     className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white transition-all duration-200"
                   >
                     <option value="">Select Session</option>
                     {sessions.map((session) => (
                       <option key={session.id} value={session.id}>
                         {session.name} ({formatDate(session.start_date)} - {formatDate(session.end_date)})
                       </option>
                     ))}
                   </select>
                                       {termForm.academic_session && (
                      <div className="mt-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-700">
                        <p className="text-sm font-medium text-blue-800 dark:text-blue-200 mb-1">
                          📅 Selected Session Date Range:
                        </p>
                        <p className="text-sm text-blue-600 dark:text-blue-300 font-semibold">
                          {(() => {
                            const selectedSession = sessions.find(s => s.id === termForm.academic_session);
                            return selectedSession ? `${formatDate(selectedSession.start_date)} to ${formatDate(selectedSession.end_date)}` : '';
                          })()}
                        </p>
                        <p className="text-xs text-blue-500 dark:text-blue-400 mt-1">
                          ⚠️ Term dates must be within this range
                        </p>
                        <p className="text-xs text-blue-500 dark:text-blue-400">
                          💡 Use the "Use Suggested Dates" button below for automatic date calculation
                        </p>
                      </div>
                    )}
                 </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={termForm.start_date}
                    onChange={(e) => setTermForm({ ...termForm, start_date: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white transition-all duration-200"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    End Date
                  </label>
                  <input
                    type="date"
                    value={termForm.end_date}
                    onChange={(e) => setTermForm({ ...termForm, end_date: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white transition-all duration-200"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Next Term Begins (Optional)
                  </label>
                  <input
                    type="date"
                    value={termForm.next_term_begins || ''}
                    onChange={(e) => setTermForm({ ...termForm, next_term_begins: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white transition-all duration-200"
                  />
                </div>

                <div className="flex items-center p-4 bg-green-50 dark:bg-green-900/20 rounded-xl">
                  <input
                    type="checkbox"
                    id="term_is_current"
                    checked={termForm.is_current}
                    onChange={(e) => setTermForm({ ...termForm, is_current: e.target.checked })}
                    className="w-5 h-5 text-green-600 focus:ring-green-500 border-gray-300 rounded"
                  />
                  <label htmlFor="term_is_current" className="ml-3 text-sm font-medium text-gray-700 dark:text-gray-300">
                    Set as current term
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-4 mt-8">
                <button
                  onClick={() => {
                    setShowTermForm(false);
                    setEditingTerm(null);
                    setTermForm({ term_type_id: '', academic_session: '', start_date: '', end_date: '', is_current: false });
                  }}
                  className="px-6 py-3 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={() => editingTerm ? handleUpdateTerm(editingTerm) : handleCreateTerm()}
                  disabled={saving}
                  className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl hover:from-blue-700 hover:to-blue-800 transition-all duration-200 disabled:opacity-50 font-semibold"
                >
                  {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                  {editingTerm ? 'Update Term' : 'Create Term'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AcademicCalendarTab;
