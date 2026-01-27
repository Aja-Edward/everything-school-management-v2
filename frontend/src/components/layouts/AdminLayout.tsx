import React from 'react';
import { Outlet } from 'react-router-dom';
import AdminDashboard from '../dashboards/admin/Admin';
import { useAuth } from '../../hooks/useAuth';

/**
 * AdminLayout
 *
 * Layout wrapper for admin pages. Renders the sidebar/navigation via AdminDashboard
 * and the page content via Outlet.
 *
 * NOTE: Data fetching is handled by individual page components (e.g., AdminDashboardContentLoader)
 * to avoid duplicate API calls.
 */
const AdminLayout: React.FC = () => {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen w-full">
      <AdminDashboard
        dashboardStats={null}
        students={null}
        teachers={null}
        parents={null}
        attendanceData={null}
        classrooms={null}
        messages={null}
        userProfile={null}
        notificationCount={0}
        messageCount={0}
        onRefresh={() => {}}
        currentUser={user}
        onLogout={logout}
        isAdmin={true}
        adminMethods={{
          getUsers: async () => ({ users: [], total: 0, page: 1, total_pages: 1 }),
          getDashboardStats: async () => ({} as any),
          getUserProfile: async () => ({} as any)
        }}
      >
        {/* Page content rendered here - each page handles its own data fetching */}
        <Outlet />
      </AdminDashboard>
    </div>
  );
};

export default AdminLayout;
