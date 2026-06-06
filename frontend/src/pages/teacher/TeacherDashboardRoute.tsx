// src/pages/teacher/TeacherDashboardRoute.tsx
import { lazy, Suspense } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { LoadingScreen } from '@/components/common/LoadingScreen';


const TeacherDashboard = lazy(() => import('@/pages/teacher/Dashboard'));

/**
 * Thin wrapper that forces TeacherDashboard to fully remount
 * whenever the authenticated user changes (e.g. after login).
 *
 * Without this, React Router reuses the existing component instance
 * on client-side navigation, so useEffect/useState never re-initialize
 * and the dashboard renders with stale context from the previous session.
 *
 * The `key` prop on TeacherDashboard tells React to treat each unique
 * user ID as a distinct component instance — equivalent to a page refresh.
 */
const TeacherDashboardRoute = () => {
  const { user, isLoading } = useAuth();

  // While auth is resolving, show the loading screen so we never
  // mount TeacherDashboard with key=undefined (which would key on
  // 'unauthenticated' and then remount again once user resolves,
  // causing a double-fetch on every load).
  if (isLoading) {
    return (
      <Suspense fallback={null}>
        <LoadingScreen
          variant="teacher"
          message="Loading Teacher Dashboard..."
        />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={
      <LoadingScreen
        variant="teacher"
        message="Loading Teacher Dashboard..."
      />
    }>
      <TeacherDashboard key={user?.id ?? 'unauthenticated'} />
    </Suspense>
  );
};

export default TeacherDashboardRoute;