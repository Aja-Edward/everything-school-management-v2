import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { UserRole } from '@/types/types';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles: UserRole[];
}

const ProtectedRoute = ({ children, allowedRoles }: ProtectedRouteProps) => {
  const { user, isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  // Show loading state while checking authentication
  if (isLoading) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="text-center">
        <div className="relative">
          {/* Outer ring */}
          <div className="absolute inset-0 rounded-full h-20 w-20 border-4 border-slate-200 mx-auto"></div>
          {/* Animated spinner */}
          <div className="animate-spin rounded-full h-20 w-20 border-4 border-slate-200 border-t-slate-700 mx-auto"></div>
        </div>
        <p className="text-slate-700 text-lg font-medium mt-8 tracking-wide">
          Verifying access
          <span className="animate-pulse">...</span>
        </p>
      </div>
    </div>
  );
}

  // If not authenticated, redirect to login page
  if (!isAuthenticated || !user) {
    // Use single login page for tenant subdomains
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Check if user's role is allowed
  if (!allowedRoles.includes(user.role)) {
    // Redirect to appropriate dashboard based on their actual role
    switch (user.role) {
      case UserRole.ADMIN:
        return <Navigate to="/admin/dashboard" replace />;
      case UserRole.TEACHER:
        return <Navigate to="/teacher/dashboard" replace />;
      case UserRole.STUDENT:
        return <Navigate to="/student/dashboard" replace />;
      case UserRole.PARENT:
        return <Navigate to="/parent/dashboard" replace />;
      default:
        return <Navigate to="/" replace />;
    }
  }

  // User is authenticated and has the correct role
  return <>{children}</>;
};

export default ProtectedRoute;
