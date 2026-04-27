import ProtectedRoute from '@/components/ProtectedRoute';
import { UserRole } from '@/types/types';
import { createBrowserRouter, Outlet, Navigate } from 'react-router-dom';
import ErrorBoundary from './../components/ErrorBoundary';
import { AuthProvider } from './../hooks/useAuth';
import { AuthLostProvider } from './../components/common/AuthLostProvider';
import { ClassroomProvider } from '@/contexts/ClassroomContext';
import { GlobalThemeProvider } from '@/contexts/GlobalThemeContext';
import { TenantProvider, useTenant } from '@/contexts/TenantContext';
import { PromotionThresholdProvider } from "@/contexts/PromotionThresholdContext";
import { SettingsProvider } from '@/contexts/SettingsContext';
import { DesignProvider } from '@/contexts/DesignContext';
import ThemeProvider from '@/components/ThemeProvider';
import FaviconUpdater from '@/components/FaviconUpdater';
import { lazy, Suspense } from 'react';
import Navbar from '@/components/home/Nav';
import Footer from '@/components/home/Footer';


// Loading component
const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-white dark:bg-gray-950">
    <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
  </div>
);

// Lazy load all components
// Public/Marketing pages (Main Domain)
const Home = lazy(() => import('./../pages/Landing'));
const School_Activities = lazy(() => import('./../pages/School_Activities'));
const About = lazy(() => import('./../pages/About'));
const HowToApplyPage = lazy(() => import('./../pages/HowToApplyPage'));
const NotFound = lazy(() => import('./../pages/NotFound'));

// Onboarding pages (Main Domain)
const SchoolRegistrationPage = lazy(() => import('./../pages/onboarding/SchoolRegistrationPage'));
const ServiceSelectionPage = lazy(() => import('./../pages/onboarding/ServiceSelectionPage'));
const RegistrationCompletePage = lazy(() => import('./../pages/onboarding/RegistrationCompletePage'));
const SetupPage = lazy(() => import('./../pages/onboarding/SetupPage'));

// Auth pages (Subdomain)
const SubdomainLandingPage = lazy(() => import('./../pages/subdomain/LandingPage'));
const SubdomainLoginPage = lazy(() => import('./../pages/subdomain/LoginPage'));
const EmailVerification = lazy(() => import('./../pages/EmailVerification'));

// Tenant public-facing landing pages (Subdomain)
const TenantLandingPage = lazy(() => import('./../pages/subdomain/TenantLandingPage'));
const TenantAboutPage = lazy(() => import('./../pages/subdomain/TenantAboutPage'));
const TenantAdmissionsPage = lazy(() => import('./../pages/subdomain/TenantAdmissionsPage'));
const TenantContactPage = lazy(() => import('./../pages/subdomain/TenantContactPage'));

// Dashboard pages (Subdomain - Protected)
const StudentDashboard = lazy(() => import('./../pages/student/Dashboard'));
const ParentDashboard = lazy(() => import('./../pages/parent/Dashboard'));
const PromotionDashboard = lazy(() => import('./../pages/admin/Promotiondashboard'));

// Teacher pages
const TeacherDashboard = lazy(() => import('./../pages/teacher/Dashboard'));
const TeacherProfile = lazy(() => import('./../pages/teacher/Profile'));
const TeacherClasses = lazy(() => import('./../pages/teacher/Classes'));
const TeacherAttendance = lazy(() => import('./../pages/teacher/Attendance'));
const TeacherStudents = lazy(() => import('./../pages/teacher/Students'));
const TeacherStudentProfile = lazy(() => import('./../pages/teacher/StudentProfile'));
const TeacherStudentsList = lazy(() => import('./../pages/teacher/StudentsList'));
const TeacherExams = lazy(() => import('./../pages/teacher/Exams'));
const TeacherResults = lazy(() => import('./../pages/teacher/Results'));
const TeacherSchedule = lazy(() => import('./../pages/teacher/Schedule'));
const TeacherSubjects = lazy(() => import('./../pages/teacher/Subjects'));
const TeacherSubjectDetail = lazy(() => import('./../pages/teacher/SubjectDetail'));
const TeacherBio = lazy(() => import('./../components/dashboards/teacher/PublicTeacherBio'));

// Admin pages
const AdminLayout = lazy(() => import('./../components/layouts/AdminLayout'));
const AdminDashboardContentLoader = lazy(() => import('./../pages/admin/AdminDashboardContentLoader'));
const StudentList = lazy(() => import('./../pages/admin/AdminStudentList'));
const AdminLoginPage = lazy(() => import('./../pages/AdminLoginPage'));
const BulkUploadPage = lazy(() => import('./../pages/admin/BulkUploadPage'));
const ParentBulkUploadPage = lazy(() => import('./../pages/admin/ParentBulkUploadPage'))
const StudentDetailView = lazy(() => import('./../components/dashboards/admin/StudentDetailView'));
const AddStudentForm = lazy(() => import('./../pages/admin/AddStudentForm'));
const EditStudentForm = lazy(() => import('./../components/dashboards/admin/EditStudentForm'));
const AdminClassroomManagement = lazy(() => import('./../pages/admin/AdminClassroomManagement'));
const ClassroomDetailPage = lazy(() => import('./../pages/admin/ClassroomDetailPage'));
const AdminSubjectManagement = lazy(() => import('./../pages/admin/AdminSubjectManagement'));
const AdminExamsManagement = lazy(() => import('./../pages/admin/AdminExamsManagement'));
const AdminLessonAttendanceViewManagement = lazy(() => import ('./../components/dashboards/admin/AdminLessonAttendanceView'))
const AdminExamScheduleManagement = lazy(() => import('./../pages/admin/AdminExamScheduleManagement'));
const AdminLessonsManagement = lazy(() => import('./../pages/admin/AdminLessonsManagement'));
const AdminAtendanceMangement = lazy(() => import('./../pages/admin/AdminAttendanceView'));
const AdminResultManagement = lazy(() => import('./../pages/admin/AdminResultManagement'));
const AllTeachers = lazy(() => import('./../pages/admin/AllTeachers'));
const TeacherBulkUploadPage = lazy(() => import('./../pages/admin/TeacherBulkUploadPage'));
const AddTeacherForm = lazy(() => import('./../pages/admin/AddTeacherForm'));
const AllParents = lazy(() => import('./../pages/admin/AllParents'));
const AddParentForm = lazy(() => import('./../pages/admin/AddParentForm'));
const AllAdmins = lazy(() => import('./../pages/admin/AllAdmins'));
const AddAdminForm = lazy(() => import('./../pages/admin/AddAdminForm'));
const SettingsPage = lazy(() => import('./../pages/admin/Settings'));
const MessageManagement = lazy(() => import('./../components/dashboards/admin/MessageManagement'));
const PasswordRecovery = lazy(() => import('./../pages/admin/PasswordRecovery'));
const StudentResultDetail = lazy(() => import('./../components/dashboards/admin/StudentResultDetail'));
const AdminTokenGenerator = lazy(() => import('./../pages/admin/TokenGenerator'));
const AdminRemarksAndSignatureManager = lazy(() => import('./../pages/admin/AdminRemarksAndSignatureManager'));

// Billing pages
const BillingDashboard = lazy(() => import('./../pages/admin/billing/Billing'));
const GenerateInvoice = lazy(() => import('./../pages/admin/billing/GenerateInvoice'));
const InvoiceDetail = lazy(() => import('./../pages/admin/billing/InvoiceDetail'));

// Advanced Exam Features (EXAM-003)
const QuestionBankManager = lazy(() => import('./../components/dashboards/admin/QuestionBankManager'));
const ExamTemplateManager = lazy(() => import('./../components/dashboards/admin/ExamTemplateManager'));
const ExamReviewManager = lazy(() => import('./../components/dashboards/admin/ExamReviewManager'));

// Platform Admin pages
const PendingPayments = lazy(() => import('./../pages/platform-admin/PendingPayments'));

// Super Admin (Platform level)
const SuperAdminPage = lazy(() => import('./../pages/SuperAdminDashbaord'));

// Error element
const RouteErrorElement = () => (
  <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-4">
    <div className="max-w-md w-full bg-white dark:bg-gray-900 rounded-xl p-8 border border-gray-200 dark:border-gray-800 text-center">
      <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Something went wrong</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        We encountered an error while loading this page.
      </p>
      <div className="space-y-3">
        <button
          onClick={() => window.location.href = '/'}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg text-sm font-medium transition-colors"
        >
          Go Home
        </button>
        <button
          onClick={() => window.location.reload()}
          className="w-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
        >
          Retry
        </button>
      </div>
    </div>
  </div>
);

// Wrapper for lazy components
const LazyWrapper = ({ children }: { children: React.ReactNode }) => (
  <Suspense fallback={<PageLoader />}>
    {children}
  </Suspense>
);

// Root layout with providers
const RootLayout = () => (
  <DesignProvider>              {/* ← must be OUTSIDE GlobalThemeProvider */}
    <GlobalThemeProvider>       {/* ← calls useDesign(), so needs DesignProvider above */}
      <TenantProvider>
        <AuthProvider>
          <AuthLostProvider>
            <SettingsProvider>
              <ThemeProvider>
                <FaviconUpdater />
                <ErrorBoundary>
                  <Outlet />
                </ErrorBoundary>
              </ThemeProvider>
            </SettingsProvider>
          </AuthLostProvider>
        </AuthProvider>
      </TenantProvider>
    </GlobalThemeProvider>
  </DesignProvider>
);

// Main domain layout with Navbar and Footer (for marketing pages)
const MainDomainLayout = () => (
  <>
    <Navbar />
    <Outlet />
    <Footer />
  </>
);

// Component to render Home only on main domain, show tenant landing page on subdomain
const HomeOrRedirect = () => {
  const { isSubdomain, isLoading } = useTenant();

  if (isLoading) return <PageLoader />;

  // Subdomain → tenant public landing page (handles unpublished state internally)
  if (isSubdomain) {
    return <LazyWrapper><TenantLandingPage /></LazyWrapper>;
  }

  // Main domain → marketing home page
  return (
    <>
      <Navbar />
      <LazyWrapper><Home /></LazyWrapper>
      <Footer />
    </>
  );
};

// Teacher protected layout
const TeacherLayout = () => (
  <ProtectedRoute allowedRoles={[UserRole.TEACHER]}>
    <Outlet />
  </ProtectedRoute>
);

// Admin protected layout
const AdminProtectedLayout = () => (
  <ProtectedRoute allowedRoles={[
    UserRole.ADMIN,
    UserRole.SUPERADMIN,
    UserRole.SECONDARY_ADMIN,
    UserRole.SENIOR_SECONDARY_ADMIN,
    UserRole.JUNIOR_SECONDARY_ADMIN,
    UserRole.PRIMARY_ADMIN,
    UserRole.NURSERY_ADMIN
  ]}>
    <LazyWrapper>
       <PromotionThresholdProvider>
        <AdminLayout />
      </PromotionThresholdProvider>
    </LazyWrapper>
  </ProtectedRoute>
);

// Route decision component based on tenant context
const TenantAwareRedirect = () => {
  const { isSubdomain, isLoading, error, tenant } = useTenant();

  if (isLoading) {
    return <PageLoader />;
  }

  // If on subdomain but tenant not found, show error
  if (isSubdomain && error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-4">
        <div className="max-w-md w-full bg-white dark:bg-gray-900 rounded-xl p-8 border border-gray-200 dark:border-gray-800 text-center">
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">School Not Found</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
            The school you're looking for doesn't exist or has been deactivated.
          </p>
          <a
            href="https://schoolplatform.com"
            className="inline-block bg-blue-600 hover:bg-blue-700 text-white py-2.5 px-6 rounded-lg text-sm font-medium transition-colors"
          >
            Go to Main Site
          </a>
        </div>
      </div>
    );
  }

  // If on subdomain, show subdomain content (login by default)
  if (isSubdomain && tenant) {
    return <Navigate to="/login" replace />;
  }

  // If on main domain, show main domain content
  return <Outlet />;
};

// Create the router configuration
export const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    errorElement: <RouteErrorElement />,
    children: [
      // ========================================
      // ROOT - Tenant-aware redirect (shows home on main domain, redirects to login on subdomain)
      // ========================================
      {
        index: true,
        element: <HomeOrRedirect />,
      },

      // ========================================
      // MAIN DOMAIN ROUTES (Marketing & Registration)
      // ========================================
      {
        element: <MainDomainLayout />,
        children: [
          {
            path: 'about',
            element: <LazyWrapper><About /></LazyWrapper>,
          },
          {
            path: 'school_activities',
            element: <LazyWrapper><School_Activities /></LazyWrapper>,
          },
          {
            path: 'how-to-apply',
            element: <LazyWrapper><HowToApplyPage /></LazyWrapper>,
          },
        ]
      },

      // Onboarding routes (no navbar/footer)
      {
        path: 'onboarding',
        children: [
          {
            path: 'register',
            element: <LazyWrapper><SchoolRegistrationPage /></LazyWrapper>,
          },
          {
            path: 'services',
            element: <LazyWrapper><ServiceSelectionPage /></LazyWrapper>,
          },
          {
            path: 'complete',
            element: <LazyWrapper><RegistrationCompletePage /></LazyWrapper>,
          }
        ]
      },


      

      // ========================================
      // SUBDOMAIN ROUTES (School Portal)
      // ========================================

      // Setup route (Subdomain - for token exchange after registration)
      {
        path: 'setup',
        element: <LazyWrapper><SetupPage /></LazyWrapper>,
      },

      // Tenant public landing sub-pages (lazy loaded)
      {
        path: 'about',
        element: <LazyWrapper><TenantAboutPage /></LazyWrapper>,
      },
      {
        path: 'admissions',
        element: <LazyWrapper><TenantAdmissionsPage /></LazyWrapper>,
      },
      {
        path: 'contact',
        element: <LazyWrapper><TenantContactPage /></LazyWrapper>,
      },

      // Auth routes (Subdomain - standalone pages)
      {
        path: 'login',
        element: <LazyWrapper><SubdomainLandingPage /></LazyWrapper>,
      },
      {
        path: 'supabase-login',
        element: <LazyWrapper><AdminLoginPage /></LazyWrapper>,
      },
      {
        path: 'verify-email',
        element: <LazyWrapper><EmailVerification /></LazyWrapper>,
      },

      // Student routes
      {
        path: 'student',
        children: [
          {
            path: 'dashboard',
            element: (
              <ProtectedRoute allowedRoles={[UserRole.STUDENT]}>
                <LazyWrapper><StudentDashboard /></LazyWrapper>
              </ProtectedRoute>
            ),
          }
        ]
      },

      // Parent routes
      {
        path: 'parent',
        children: [
          {
            path: 'dashboard',
            element: (
              <ProtectedRoute allowedRoles={[UserRole.PARENT]}>
                <LazyWrapper><ParentDashboard /></LazyWrapper>
              </ProtectedRoute>
            ),
          }
        ]
      },

      // Teacher routes
      {
        path: 'teacher',
        element: <TeacherLayout />,
        children: [
          {
            path: 'dashboard',
            element: <LazyWrapper><TeacherDashboard /></LazyWrapper>,
          },
          {
            path: 'profile',
            element: <LazyWrapper><TeacherProfile /></LazyWrapper>,
          },
          {
            path: 'bio/:teacherId',
            element: <LazyWrapper><TeacherBio /></LazyWrapper>,
          },
          {
            path: 'classes',
            element: <LazyWrapper><TeacherClasses /></LazyWrapper>,
          },
          {
            path: 'attendance/:classId?',
            element: <LazyWrapper><TeacherAttendance /></LazyWrapper>,
          },
          {
            path: 'attendance',
            element: <LazyWrapper><TeacherAttendance /></LazyWrapper>,
          },
          {
            path: 'students/:classId',
            element: <LazyWrapper><TeacherStudents /></LazyWrapper>,
          },
          {
            path: 'student/:studentId',
            element: <LazyWrapper><TeacherStudentProfile /></LazyWrapper>,
          },
          {
            path: 'students',
            element: <LazyWrapper><TeacherStudentsList /></LazyWrapper>,
          },
          {
            path: 'exams',
            element: <LazyWrapper><TeacherExams /></LazyWrapper>,
          },
          {
            path: 'question-bank',
            element: <LazyWrapper><QuestionBankManager /></LazyWrapper>,
          },
          {
            path: 'exam-templates',
            element: <LazyWrapper><ExamTemplateManager /></LazyWrapper>,
          },
          {
            path: 'exam-reviews',
            element: <LazyWrapper><ExamReviewManager /></LazyWrapper>,
          },
          {
            path: 'results',
            element: <LazyWrapper><TeacherResults /></LazyWrapper>,
          },
          {
            path: 'schedule',
            element: <LazyWrapper><TeacherSchedule /></LazyWrapper>,
          },
          {
            path: 'subjects',
            element: <LazyWrapper><TeacherSubjects /></LazyWrapper>,
          },
          {
            path: 'subjects/:subjectId',
            element: <LazyWrapper><TeacherSubjectDetail /></LazyWrapper>,
          }
        ]
      },

      // Admin routes
      {
        path: 'admin',
        element: <AdminProtectedLayout />,
        children: [

          {
            path: 'classroom-management',
            element: (
              <ClassroomProvider>
                <Outlet />
              </ClassroomProvider>
            ),
            children: [
              {
                path: 'classes',
                element: <LazyWrapper><AdminClassroomManagement /></LazyWrapper>,
              },
              {
                path: 'classrooms/:classroomId',
                element: <LazyWrapper><ClassroomDetailPage /></LazyWrapper>,
              },
              {
                path: 'subjects',
                element: <LazyWrapper><AdminSubjectManagement /></LazyWrapper>,
              },
              {
                path: 'settings',
                element: <LazyWrapper><SettingsPage /></LazyWrapper>,
              },
            ],
            
          },

          {
            index: true,
            element: <LazyWrapper><AdminDashboardContentLoader /></LazyWrapper>,
          },
          {
            path: 'dashboard',
            element: <LazyWrapper><AdminDashboardContentLoader /></LazyWrapper>,
          },
          {
            path: 'student_bulk_upload',
            element: <LazyWrapper><BulkUploadPage/></LazyWrapper>
          },
          {
            path: 'token-generator',
            element: <LazyWrapper><AdminTokenGenerator /></LazyWrapper>,
          },
          
          {
            path: 'admin-remarks',
            element: <LazyWrapper><AdminRemarksAndSignatureManager /></LazyWrapper>,
          },
          {
            path: 'students',
            element: <LazyWrapper><StudentList /></LazyWrapper>,
          },
          {
            path: 'student_promotions',
            element: <LazyWrapper><PromotionDashboard /></LazyWrapper>,
          },
          {
            path: 'students/:id',
            element: <LazyWrapper><StudentDetailView /></LazyWrapper>,
          },
          {
            path: 'students/add',
            element: <LazyWrapper><AddStudentForm /></LazyWrapper>,
          },
          {
            path: 'students/:id/edit',
            element: <LazyWrapper><EditStudentForm /></LazyWrapper>,
          },
          {
            path: 'results',
            element: <LazyWrapper><AdminResultManagement /></LazyWrapper>,
          },
          {
            path: 'results/student/:studentId',
            element: <LazyWrapper><StudentResultDetail /></LazyWrapper>,
          },
          
          {
            path: 'exams',
            element: <LazyWrapper><AdminExamsManagement /></LazyWrapper>,
          },
          {
            path: 'exam-schedules',
            element: <LazyWrapper><AdminExamScheduleManagement /></LazyWrapper>,
          },
          {
            path: 'lessons',
            element: <LazyWrapper><AdminLessonsManagement /></LazyWrapper>,
          },
          {
            path: 'attendance',
            element: <LazyWrapper><AdminAtendanceMangement /></LazyWrapper>,
          },
          
          {
            path: 'lesson_attendance',
            element: <LazyWrapper><AdminLessonAttendanceViewManagement /></LazyWrapper>,
          },

          {
            path: 'teachers',
            element: <LazyWrapper><AllTeachers /></LazyWrapper>,
          },
          {
            path: 'teacher_bulk_upload',
            element: <LazyWrapper><TeacherBulkUploadPage /></LazyWrapper>,
          },
          {
            path: 'teachers/add',
            element: <LazyWrapper><AddTeacherForm /></LazyWrapper>,
          },
          {
            path: 'parents',
            element: <LazyWrapper><AllParents /></LazyWrapper>,
          },
          {
            path: 'parents/add',
            element: <LazyWrapper><AddParentForm /></LazyWrapper>,
          },
          {
            path: 'parent_bulk_upload',
            element: <LazyWrapper><ParentBulkUploadPage/></LazyWrapper>
          },
          {
            path: 'admins',
            element: <LazyWrapper><AllAdmins /></LazyWrapper>,
          },
          {
            path: 'admins/add',
            element: <LazyWrapper><AddAdminForm /></LazyWrapper>,
          },
          {
            path: 'settings',
            element: <LazyWrapper><SettingsPage /></LazyWrapper>,
          },
          {
            path: 'messages',
            element: <LazyWrapper><MessageManagement /></LazyWrapper>,
          },
          {
            path: 'password-recovery',
            element: <LazyWrapper><PasswordRecovery /></LazyWrapper>,
          },
          // {
          //   path: 'result-checker',
          //   element: <LazyWrapper><ResultChecker /></LazyWrapper>,
          // },
          // {
          //   path: 'student-result-checker',
          //   element: <LazyWrapper><StudentResultChecker onClose={() => {}} /></LazyWrapper>,
          // },
          // Billing routes
          {
            path: 'billing',
            element: <LazyWrapper><BillingDashboard /></LazyWrapper>,
          },
          {
            path: 'billing/generate-invoice',
            element: <LazyWrapper><GenerateInvoice /></LazyWrapper>,
          },
          {
            path: 'billing/invoices/:invoiceId',
            element: <LazyWrapper><InvoiceDetail /></LazyWrapper>,
          }
        ]
      },

      // Platform Admin routes (accessed from main domain or platform subdomain)
      {
        path: 'platform-admin',
        children: [
          {
            path: 'pending-payments',
            element: (
              <ProtectedRoute allowedRoles={[UserRole.PLATFORM_ADMIN, UserRole.SUPERADMIN]}>
                <LazyWrapper><PendingPayments /></LazyWrapper>
              </ProtectedRoute>
            ),
          }
        ]
      },

      // Super Admin (Platform level - accessed from main domain)
      {
        path: 'super-admin/dashboard',
        element: <LazyWrapper><SuperAdminPage /></LazyWrapper>,
      },

      // 404
      {
        path: '*',
        element: <LazyWrapper><NotFound /></LazyWrapper>,
      }
    ]
  }
]);

export default router;
