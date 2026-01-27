import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useDocumentTitle } from './../hooks/useDocumentTitle';
import Footer from './../components/home/Footer';
import Navbar from './../components/home/Nav';
import { UserRole } from '@/types/types';
import { GraduationCap, Users, UserCircle, Shield, ArrowLeft, Sparkles } from 'lucide-react';

interface RoleCardProps {
  role: UserRole;
  title: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  onClick: () => void;
}

const RoleCard: React.FC<RoleCardProps> = ({ title, description, icon, color, onClick }) => {
  return (
    <button
      onClick={onClick}
      className={`
        group relative w-full p-5 rounded-xl border border-secondary-200 dark:border-secondary-700
        bg-white dark:bg-secondary-800 hover:border-transparent
        transition-all duration-300 ease-out
        hover:shadow-lg hover:-translate-y-1
        focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2
        dark:focus-visible:ring-offset-secondary-900
      `}
    >
      {/* Gradient overlay on hover */}
      <div
        className={`
          absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100
          transition-opacity duration-300 -z-10
          ${color}
        `}
        style={{ filter: 'blur(40px)', transform: 'scale(0.9)' }}
      />

      <div className="flex items-start gap-4">
        <div
          className={`
            flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center
            transition-all duration-300
            ${color} bg-opacity-10 group-hover:bg-opacity-20
          `}
        >
          <span className={`w-6 h-6 ${color.replace('bg-', 'text-')}`}>
            {icon}
          </span>
        </div>

        <div className="flex-1 text-left">
          <h3 className="font-semibold text-secondary-900 dark:text-white group-hover:text-secondary-900 dark:group-hover:text-white">
            {title}
          </h3>
          <p className="mt-1 text-sm text-secondary-500 dark:text-secondary-400">
            {description}
          </p>
        </div>

        <div className="flex-shrink-0 self-center">
          <svg
            className="w-5 h-5 text-secondary-400 group-hover:text-secondary-600 dark:group-hover:text-secondary-300 group-hover:translate-x-1 transition-all duration-200"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </div>
    </button>
  );
};

const Login = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  useDocumentTitle(t('login.title', 'Login - School Portal'));

  const handleRoleSelection = (role: UserRole) => {
    switch (role) {
      case UserRole.STUDENT:
        navigate('/student-login');
        break;
      case UserRole.TEACHER:
        navigate('/teacher-login');
        break;
      case UserRole.PARENT:
        navigate('/parent-login');
        break;
      case UserRole.ADMIN:
        navigate('/admin-login');
        break;
      default:
        navigate('/');
    }
  };

  const handleBackToHome = () => {
    navigate('/');
  };

  const roles = [
    {
      role: UserRole.STUDENT,
      title: 'Student Login',
      description: 'Access your dashboard, results, and learning materials',
      icon: <GraduationCap className="w-full h-full" />,
      color: 'bg-info-500',
    },
    {
      role: UserRole.TEACHER,
      title: 'Teacher Login',
      description: 'Manage classes, record results, and track attendance',
      icon: <UserCircle className="w-full h-full" />,
      color: 'bg-success-500',
    },
    {
      role: UserRole.PARENT,
      title: 'Parent Login',
      description: "View your children's progress, results, and fee status",
      icon: <Users className="w-full h-full" />,
      color: 'bg-primary-500',
    },
    {
      role: UserRole.ADMIN,
      title: 'Admin Login',
      description: 'Full access to school management and settings',
      icon: <Shield className="w-full h-full" />,
      color: 'bg-error-500',
    },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-secondary-50 dark:bg-secondary-950">
      <Navbar />

      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary-100 dark:bg-primary-900/30 mb-6">
              <Sparkles className="w-8 h-8 text-primary-600 dark:text-primary-400" />
            </div>

            <h1 className="text-2xl font-bold text-secondary-900 dark:text-white">
              Welcome Back
            </h1>
            <p className="mt-2 text-secondary-600 dark:text-secondary-400">
              Select your role to continue to your dashboard
            </p>
          </div>

          {/* Role Selection Cards */}
          <div className="space-y-3">
            {roles.map((roleData) => (
              <RoleCard
                key={roleData.role}
                {...roleData}
                onClick={() => handleRoleSelection(roleData.role)}
              />
            ))}
          </div>

          {/* Back to Home */}
          <div className="mt-8 text-center">
            <button
              onClick={handleBackToHome}
              className="inline-flex items-center gap-2 text-sm text-secondary-600 dark:text-secondary-400 hover:text-secondary-900 dark:hover:text-white transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Home
            </button>
          </div>

          {/* Help Text */}
          <div className="mt-6 p-4 rounded-xl bg-secondary-100 dark:bg-secondary-800/50 border border-secondary-200 dark:border-secondary-700">
            <p className="text-xs text-secondary-500 dark:text-secondary-400 text-center">
              Need help? Contact your school administrator or{' '}
              <a href="/contact" className="text-primary-600 dark:text-primary-400 hover:underline">
                reach out to support
              </a>
            </p>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default Login;
