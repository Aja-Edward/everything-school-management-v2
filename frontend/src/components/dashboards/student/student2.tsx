import { useState, useEffect } from "react";
import {
  User, Calendar, BookOpen, Trophy, Clock, CreditCard, MessageSquare, Settings,
  GraduationCap, Home, AlertTriangle, ArrowLeft, Download,
  LogOut, Menu, X, Check
} from 'lucide-react';

// Import your actual components
import PortalLogin from './PortalLogin';
import ResultSelection from './ResultSelection';

import StudentResultDisplay2 from '@/components/dashboards/admin/StudentResultDisplay2'
import DashboardContent from './DashboardContent';
import ProfileTab from './ProfileTab';
import StudentLessons from '@/pages/student/StudentLessons';
import { useAuth } from '@/hooks/useAuth';
import { useSettings } from '@/hooks/useSettings';
import api from '@/services/api';
import { useNavigate } from 'react-router-dom';

interface TokenVerificationData {
  is_valid: boolean;
  message: string;
  school_term: string;
  expires_at: string;
  student_id?: string | number;
  student_name?: string;
  current_class?: string;
  education_level?: string;
}

interface SelectionData {
  academicSession: any;
  term: any;
  class: any;
  resultType?: string;
  examSession?: string;
}

interface StudentRecord {
  id: number;
  full_name: string;
  username: string;
  student_class: string;
  education_level: string;
  profile_picture?: string;
  user: number;
}

const StudentPortal = () => {
  const { user, logout } = useAuth();
  const { settings } = useSettings();
  const navigate = useNavigate();

  const isStudentPortalEnabled = settings?.student_portal_enabled !== false;

  // Navigation state
  const [activeSection, setActiveSection] = useState('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Portal authentication flow states
  const [portalStep, setPortalStep] = useState<'login' | 'selection' | 'results'>('login');
  const [verifiedTokenData, setVerifiedTokenData] = useState<TokenVerificationData | null>(null);
  const [selections, setSelections] = useState<SelectionData | null>(null);

  // CRITICAL: Add state for actual student record
  const [studentRecord, setStudentRecord] = useState<StudentRecord | null>(null);
  const [loadingStudent, setLoadingStudent] = useState(false);

  // CRITICAL FIX: Fetch actual student record when user is authenticated
  useEffect(() => {
    const fetchStudentRecord = async () => {
      if (!user?.id) {
        console.log('⏳ No authenticated user yet');
        return;
      }

      try {
        setLoadingStudent(true);
        console.log('🔍 Fetching student record for user ID:', user.id);

        // Query students by user_id
        const response = await api.get(`/api/students/students/?user=${user.id}`);
        console.log('✅ Student query response:', response);

        const students = Array.isArray(response) ? response : (response.results || []);

        if (students.length > 0) {
          const student = students[0];
          console.log('✅ Found student record:', {
            userId: user.id,
            studentId: student.id,
            studentName: student.full_name,
            educationLevel: student.education_level,
            class: student.student_class
          });

          setStudentRecord(student);
        } else {
          console.error('❌ No student record found for user ID:', user.id);
        }
      } catch (error) {
        console.error('❌ Error fetching student record:', error);
      } finally {
        setLoadingStudent(false);
      }
    };

    fetchStudentRecord();
  }, [user?.id]);

  const handleTokenVerified = (tokenData?: TokenVerificationData | any) => {

    // Use the student record ID if we have it, otherwise try to extract from token
    const studentId = studentRecord?.id || tokenData?.student_id;

    if (!studentId) {
      console.warn('⚠️ No student ID available during token verification');
    }

    const enhancedTokenData: TokenVerificationData = {
      is_valid: tokenData?.is_valid ?? true,
      message: tokenData?.message ?? 'Token verified successfully',
      school_term: tokenData?.school_term ?? 'Current Term',
      expires_at: tokenData?.expires_at ?? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      student_id: studentId,
      student_name: tokenData?.student_name ?? studentRecord?.full_name ?? user?.full_name,
      current_class: tokenData?.current_class ?? studentRecord?.student_class,
      education_level: tokenData?.education_level ?? studentRecord?.education_level
    };

    console.log('🔍 Enhanced token data with student_id:', enhancedTokenData);
    console.log('🔑 AUTHENTICATED STUDENT ID:', studentId);

    setVerifiedTokenData(enhancedTokenData);
    setPortalStep('selection');
  };

  const handleSelectionComplete = (data: SelectionData) => {
    setSelections(data);
    setPortalStep('results');
  };

  const handleBackToSelection = () => {
    setPortalStep('selection');
  };

  const handlePortalLogout = () => {
    setPortalStep('login');
    setVerifiedTokenData(null);
    setSelections(null);
  };

  const handleTabChange = (tabId: string) => {
    setActiveSection(tabId);
    setIsSidebarOpen(false);
    if (tabId !== 'portal') {
      setPortalStep('login');
      setVerifiedTokenData(null);
      setSelections(null);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const handleGoHome = () => {
    navigate('/');
  };

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: Home },
    { id: 'portal', label: 'Portal', icon: GraduationCap },
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'academics', label: 'Academics', icon: GraduationCap },
    { id: 'schedule', label: 'Schedule', icon: Calendar },
    { id: 'assignments', label: 'Assignments', icon: BookOpen },
    { id: 'grades', label: 'Grades', icon: Trophy },
    { id: 'attendance', label: 'Attendance', icon: Clock },
    { id: 'fees', label: 'Fees', icon: CreditCard },
    { id: 'messages', label: 'Messages', icon: MessageSquare },
    { id: 'settings', label: 'Settings', icon: Settings }
  ];

  // Show loading while fetching student record
  if (loadingStudent) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Loading Student Portal</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">Please wait while we fetch your information...</p>
        </div>
      </div>
    );
  }

  // Show error if user is authenticated but no student record found
  if (user && !studentRecord && !loadingStudent) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-6">
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-8 max-w-md text-center shadow-lg border border-gray-200 dark:border-gray-800">
          <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-8 h-8 text-red-600 dark:text-red-400" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Student Record Not Found
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            Your user account (ID: {user.id}) is not linked to a student record.
            Please contact your school administrator for assistance.
          </p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={handleGoHome}
              className="px-5 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg font-medium hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors duration-200 flex items-center gap-2"
            >
              <Home size={18} />
              Go Home
            </button>
            <button
              onClick={handleLogout}
              className="px-5 py-2.5 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors duration-200 flex items-center gap-2"
            >
              <LogOut size={18} />
              Logout
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Top Navigation Bar */}
      <div className="sticky top-0 z-50 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Left: Logo & Menu */}
            <div className="flex items-center gap-4">
              <button
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                className="md:hidden p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                {isSidebarOpen ? <X size={24} className="text-gray-700 dark:text-gray-300" /> : <Menu size={24} className="text-gray-700 dark:text-gray-300" />}
              </button>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
                  <GraduationCap className="text-white" size={20} />
                </div>
                <div>
                  <h1 className="text-base font-bold text-gray-900 dark:text-white">Student Portal</h1>
                  <p className="text-xs text-gray-600 dark:text-gray-400">{studentRecord?.full_name}</p>
                </div>
              </div>
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-2">
              <button
                onClick={handleGoHome}
                className="hidden sm:flex items-center gap-2 px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors font-medium text-sm"
              >
                <Home size={18} />
                <span className="hidden lg:inline">Home</span>
              </button>
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 px-4 py-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-100 rounded-lg transition-colors font-medium text-sm"
              >
                <LogOut size={18} />
                <span className="hidden lg:inline">Logout</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-4 md:p-6">
        <div className="flex flex-col md:flex-row gap-6">
          {/* Sidebar */}
          <div className="md:w-72">
            {/* Mobile Overlay */}
            {isSidebarOpen && (
              <div
                className="fixed inset-0 z-40 bg-black/50 md:hidden"
                onClick={() => setIsSidebarOpen(false)}
              />
            )}

            {/* Sidebar Content */}
            <nav className={`${
              isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
            } fixed md:relative left-0 top-0 h-full md:h-auto w-72 z-50 md:z-auto bg-white dark:bg-gray-900 md:rounded-xl shadow-lg border-r md:border border-gray-200 dark:border-gray-800 p-4 transition-transform duration-300 overflow-y-auto`}>
              {/* Mobile Header */}
              <div className="md:hidden flex items-center justify-between mb-6 pb-4 border-b border-gray-200 dark:border-gray-800">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">Menu</h2>
                <button
                  onClick={() => setIsSidebarOpen(false)}
                  className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  <X size={20} className="text-gray-700 dark:text-gray-300" />
                </button>
              </div>

              {/* Student Info Card - Clean Design */}
              {studentRecord && (
                <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
                  <div className="flex items-center gap-3 mb-3">
                    {studentRecord.profile_picture ? (
                      <img
                        src={studentRecord.profile_picture}
                        alt={studentRecord.full_name}
                        className="w-12 h-12 rounded-full border-2 border-gray-200 dark:border-gray-700"
                      />
                    ) : (
                      <div className="w-12 h-12 bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center">
                        <User className="text-gray-600 dark:text-gray-400" size={22} />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-sm text-gray-900 dark:text-white truncate">{studentRecord.full_name}</h3>
                      <p className="text-xs text-gray-600 dark:text-gray-400">{studentRecord.student_class}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs bg-white dark:bg-gray-900 rounded-lg px-3 py-2 border border-gray-200 dark:border-gray-700">
                    <span className="text-gray-600 dark:text-gray-400">ID: {studentRecord.id}</span>
                    <span className="text-gray-600 dark:text-gray-400">{studentRecord.education_level}</span>
                  </div>
                </div>
              )}

              {/* Menu Items - Clean Design */}
              <ul className="space-y-1">
                {menuItems.map(item => (
                  <li key={item.id}>
                    <button
                      className={`flex items-center w-full px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-200 ${
                        activeSection === item.id
                          ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900'
                          : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                      }`}
                      onClick={() => handleTabChange(item.id)}
                    >
                      <item.icon className="mr-3 flex-shrink-0" size={18} />
                      <span className="flex-1 text-left">{item.label}</span>
                      {activeSection === item.id && (
                        <div className="w-1.5 h-1.5 bg-white dark:bg-gray-900 rounded-full"></div>
                      )}
                    </button>
                  </li>
                ))}
              </ul>

              {/* Mobile Actions */}
              <div className="md:hidden mt-6 pt-6 border-t border-gray-200 dark:border-gray-800 space-y-2">
                <button
                  onClick={handleGoHome}
                  className="flex items-center gap-3 w-full px-4 py-3 bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors font-medium text-sm"
                >
                  <Home size={18} />
                  Go to Home
                </button>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-3 w-full px-4 py-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors font-medium text-sm"
                >
                  <LogOut size={18} />
                  Logout
                </button>
              </div>
            </nav>
          </div>

          {/* Main Content */}
          <main className="flex-1 min-w-0">
            {!isStudentPortalEnabled ? (
              <DisabledPortalMessage onGoHome={handleGoHome} onLogout={handleLogout} />
            ) : activeSection === 'portal' ? (
              <PortalContent
                portalStep={portalStep}
                verifiedTokenData={verifiedTokenData}
                selections={selections}
                studentRecord={studentRecord}
                onTokenVerified={handleTokenVerified}
                onSelectionComplete={handleSelectionComplete}
                onBackToSelection={handleBackToSelection}
                onPortalLogout={handlePortalLogout}
              />
            ) : activeSection === 'dashboard' ? (
              <DashboardContent />
            ) : activeSection === 'profile' ? (
              <ProfileTab />
            ) : activeSection === 'schedule' ? (
              <StudentLessons />
            ) : (
              <ComingSoonMessage sectionName={menuItems.find(item => item.id === activeSection)?.label} />
            )}
          </main>
        </div>
      </div>
    </div>
  );
};

// Portal Content Component
const PortalContent = ({
  portalStep,
  verifiedTokenData,
  selections,
  studentRecord,
  onTokenVerified,
  onSelectionComplete,
  onBackToSelection,
  onPortalLogout,
}: any) => {
  if (!studentRecord) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-xl p-8 text-center shadow-lg border border-gray-200 dark:border-gray-800">
        <AlertTriangle className="w-12 h-12 text-yellow-600 mx-auto mb-4" />
        <p className="text-gray-600 dark:text-gray-400">
          Student record not available. Please refresh the page.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Progress Indicator - Only show after login */}
      {portalStep !== 'login' && (
        <div className="bg-white dark:bg-gray-900 rounded-xl p-6 shadow-lg border border-gray-200 dark:border-gray-800">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">Your Progress</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">Track your result retrieval journey</p>
            </div>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <div className="px-3 py-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <p className="text-xs text-blue-900 dark:text-blue-100 font-medium">
                  {studentRecord.full_name} • ID: {studentRecord.id}
                </p>
                <p className="text-xs text-blue-700 dark:text-blue-300 mt-0.5">
                  {studentRecord.student_class} • {studentRecord.education_level}
                </p>
              </div>
              <button
                onClick={onPortalLogout}
                className="px-3 py-2 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors text-sm font-medium border border-red-200 dark:border-red-800 flex items-center gap-2"
              >
                <LogOut size={14} />
                Exit Portal
              </button>
            </div>
          </div>

          {/* Progress Steps */}
          <div className="flex items-center">
            <Step label="Verified" active={true} completed={true} />
            <div className="flex-1 h-1.5 mx-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div className={`h-full transition-all duration-500 ${
                portalStep === 'results' ? 'bg-green-600 w-full' : 'bg-blue-600 w-1/2'
              }`} />
            </div>
            <Step label="Selection" active={portalStep === 'selection'} completed={portalStep === 'results'} />
            <div className="flex-1 h-1.5 mx-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div className={`h-full transition-all duration-500 ${
                portalStep === 'results' ? 'bg-green-600 w-full' : ''
              }`} />
            </div>
            <Step label="Results" active={portalStep === 'results'} completed={false} />
          </div>
        </div>
      )}

      {/* Content based on step */}
      {portalStep === 'login' && (
        <PortalLogin onSuccess={onTokenVerified} />
      )}

      {portalStep === 'selection' && verifiedTokenData && (
        <div className="space-y-6">
          {/* Token Verification Success Banner */}
          <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl p-6 text-white shadow-lg">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center flex-shrink-0">
                <GraduationCap size={24} />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold mb-2">Access Granted!</h3>
                <p className="text-white/90 mb-3 text-sm">{verifiedTokenData.school_term}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <div className="bg-white/10 rounded-lg px-3 py-2">
                    <p className="text-white/70 text-xs mb-1">Student</p>
                    <p className="font-medium">{studentRecord.full_name}</p>
                  </div>
                  <div className="bg-white/10 rounded-lg px-3 py-2">
                    <p className="text-white/70 text-xs mb-1">Class & Level</p>
                    <p className="font-medium">{studentRecord.student_class} • {studentRecord.education_level}</p>
                  </div>
                </div>
                <p className="text-xs text-white/70 mt-3">
                  Token expires: {new Date(verifiedTokenData.expires_at).toLocaleString()}
                </p>
              </div>
            </div>
          </div>

          <ResultSelection
            onSelectionComplete={onSelectionComplete}
            verifiedTokenData={verifiedTokenData}
          />
        </div>
      )}

      {portalStep === 'results' && selections && verifiedTokenData && (
        <div className="space-y-4">
          <button
            onClick={onBackToSelection}
            className="px-4 py-2.5 bg-white dark:bg-gray-900 text-gray-900 dark:text-white rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors flex items-center gap-2 shadow-sm border border-gray-200 dark:border-gray-800 font-medium text-sm"
          >
            <ArrowLeft size={18} />
            Back to Selection
          </button>

          <StudentResultDisplay2
            student={{
              id: String(studentRecord.id),
              full_name: studentRecord.full_name,
              username: studentRecord.username,
              student_class: studentRecord.student_class,
              education_level: studentRecord.education_level,
              profile_picture: studentRecord.profile_picture,
            }}
            selections={selections}
            currentUser={{
              id: String(studentRecord.user),
              student_id: String(studentRecord.id),
            }}
          />
        </div>
      )}
    </div>
  );
};

// Progress Step Component
const Step = ({ label, active, completed }: { label: string; active: boolean; completed: boolean }) => (
  <div className="flex flex-col items-center min-w-[80px]">
    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold transition-all duration-300 ${
      completed ? 'bg-green-600 text-white' :
      active ? 'bg-blue-600 text-white' :
      'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
    }`}>
      {completed ? <Check size={20} /> : active ? '●' : '○'}
    </div>
    <span className={`text-xs mt-2 font-medium text-center ${
      active ? 'text-blue-600 dark:text-blue-400' :
      completed ? 'text-green-600 dark:text-green-400' :
      'text-gray-500 dark:text-gray-400'
    }`}>
      {label}
    </span>
  </div>
);

// Disabled Portal Message
const DisabledPortalMessage = ({ onGoHome, onLogout }: { onGoHome: () => void; onLogout: () => void }) => (
  <div className="bg-white dark:bg-gray-900 rounded-xl p-10 shadow-lg border border-gray-200 dark:border-gray-800 text-center">
    <div className="w-20 h-20 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
      <AlertTriangle className="text-red-600 dark:text-red-400" size={32} />
    </div>
    <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">Portal Access Disabled</h2>
    <p className="text-gray-600 dark:text-gray-400 mb-8 max-w-md mx-auto">
      The student portal is currently disabled by the administrator. Please contact your school for more information.
    </p>
    <div className="flex gap-3 justify-center">
      <button
        onClick={onGoHome}
        className="px-5 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg font-medium hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors flex items-center gap-2"
      >
        <Home size={18} />
        Go Home
      </button>
      <button
        onClick={onLogout}
        className="px-5 py-2.5 bg-gray-200 dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg font-medium hover:bg-gray-300 dark:hover:bg-gray-700 transition-colors flex items-center gap-2"
      >
        <LogOut size={18} />
        Logout
      </button>
    </div>
  </div>
);

// Coming Soon Message
const ComingSoonMessage = ({ sectionName }: { sectionName?: string }) => (
  <div className="bg-white dark:bg-gray-900 rounded-xl p-10 shadow-lg border border-gray-200 dark:border-gray-800 text-center">
    <div className="w-20 h-20 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
      <Settings className="text-blue-600 dark:text-blue-400" size={32} />
    </div>
    <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">Coming Soon</h2>
    <p className="text-gray-600 dark:text-gray-400 mb-2">
      The <span className="font-semibold text-blue-600 dark:text-blue-400">{sectionName}</span> section is under development.
    </p>
    <p className="text-sm text-gray-500 dark:text-gray-500">
      We're working hard to bring you this feature. Stay tuned!
    </p>
  </div>
);

export default StudentPortal;
