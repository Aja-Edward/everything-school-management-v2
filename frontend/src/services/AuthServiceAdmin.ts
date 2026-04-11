import { useAuth } from '@/hooks/useAuth'; 
import api from '@/services/api';
import type { 
  // UserProfile, 
  // UserVerificationStatus, 
  UserContactInfo, 
  CustomUser, 
  LoginCredentials,
  AdminUserManagement,
  UserCreationData,
  UserUpdateData,
  AdminDashboardStats,
  AdminAuditLog,
  FullUserData
} from '@/types/types';
import { UserProfile, UserVerificationStatus, UserRole, AdminUserData  } from '@/types/types'

// Enhanced Admin Auth Hook that extends useAuth
export function useAdminAuth() {
  const baseAuth = useAuth();

  // Verify admin permissions
  const isAdmin = (): boolean => {
    return baseAuth.user?.role === UserRole.ADMIN;
  };

  // Enhanced login with admin verification
  const adminLogin = async (credentials: LoginCredentials): Promise<FullUserData | undefined> => {
    try {
      const userData = await baseAuth.login(credentials);
      
      // Verify admin permissions after login
      if (userData && userData.role !== UserRole.ADMIN) {
        await baseAuth.logout();
        throw new Error('Insufficient permissions. Admin access required.');
      }
      
      return userData;
    } catch (error) {
      console.error('Admin login failed:', error);
      throw error;
    }
  };

  // ============================================
  // USER MANAGEMENT METHODS
  // ============================================

  // Get all users with pagination and filtering
  const getUsers = async (params?: {
    page?: number;
    limit?: number;
    role?: UserRole;
    search?: string;
    is_active?: boolean;
    is_verified?: boolean;
  }): Promise<{
    users: AdminUserManagement[];
    total: number;
    page: number;
    total_pages: number;
  }> => {
    try {
      if (!isAdmin()) throw new Error('Admin access required');
      
      // Use the correct endpoints based on role
      let endpoint = '';
      if (params?.role === UserRole.STUDENT) {
        endpoint = '/students/';
      } else if (params?.role === UserRole.TEACHER) {
        endpoint = '/teachers/teachers/'; // Fixed: use correct teachers endpoint
      } else if (params?.role === UserRole.PARENT) {
        endpoint = '/parents/';
      } else {
        // For admin or general users, combine all endpoints
                 const [studentsRes, teachersRes, parentsRes] = await Promise.all([
                       api.get('/api/students/', params),
                       api.get('/api/teachers/teachers/', params), // Fixed: use correct teachers endpoint
                       api.get('/api/parents/', params)
         ]);
        
        // Combine and format the results
        const allUsers = [
          ...(studentsRes.results || studentsRes || []).map((student: any) => ({
            id: student.id,
            user_data: {
              id: student.user?.id || student.id,
              email: student.user?.email || student.email,
              first_name: student.user?.first_name || student.first_name,
              last_name: student.user?.last_name || student.last_name,
              role: UserRole.STUDENT,
              student_data: student
            },
            permissions: [],
            last_login: student.user?.last_login,
            created_by: undefined,
            is_suspended: false,
            suspension_reason: undefined,
            notes: undefined
          })) || [],
          ...(teachersRes.results || teachersRes || []).map((teacher: any) => ({
            id: teacher.id,
            user_data: {
              id: teacher.user?.id || teacher.id,
              email: teacher.user?.email || teacher.email,
              first_name: teacher.user?.first_name || teacher.first_name,
              last_name: teacher.user?.last_name || teacher.last_name,
              role: UserRole.TEACHER,
              teacher_data: teacher
            },
            permissions: [],
            last_login: teacher.user?.last_login,
            created_by: undefined,
            is_suspended: false,
            suspension_reason: undefined,
            notes: undefined
          })),
          ...(parentsRes.results || parentsRes || []).map((parent: any) => ({
            id: parent.id,
            user_data: {
              id: parent.user?.id || parent.id,
              email: parent.user?.email || parent.email,
              first_name: parent.user?.first_name || parent.first_name,
              last_name: parent.user?.last_name || parent.last_name,
              role: UserRole.PARENT,
              parent_data: parent
            },
            permissions: [],
            last_login: parent.user?.last_login,
            created_by: undefined,
            is_suspended: false,
            suspension_reason: undefined,
            notes: undefined
          }))
        ];
        
        return {
          users: allUsers,
          total: allUsers.length,
          page: 1,
          total_pages: 1
        };
      }
      
      const response = await api.get(endpoint, params);
      return response.data;
    } catch (error) {
      console.error('Failed to fetch users:', error);
      throw error;
    }
  };

  // Get user by ID
  const getUser = async (userId: number): Promise<AdminUserManagement> => {
    try {
      if (!isAdmin()) throw new Error('Admin access required');
      
      // Try different endpoints to find the user
      try {
        const response = await api.get(`/api/students/${userId}/`);
        return {
          id: response.data.id,
          user_data: {
            id: response.data.user?.id || response.data.id,
            email: response.data.user?.email || response.data.email,
            first_name: response.data.user?.first_name || response.data.first_name,
            last_name: response.data.user?.last_name || response.data.last_name,
            role: UserRole.STUDENT,
            student_data: response.data
          },
          permissions: [],
          last_login: response.data.user?.last_login,
          created_by: undefined,
          is_suspended: false,
          suspension_reason: undefined,
          notes: undefined
        };
      } catch (studentError) {
        try {
          const response = await api.get(`/api/teachers/teachers/${userId}/`);
          return {
            id: response.data.id,
            user_data: {
              id: response.data.user?.id || response.data.id,
              email: response.data.user?.email || response.data.email,
              first_name: response.data.user?.first_name || response.data.first_name,
              last_name: response.data.user?.last_name || response.data.last_name,
              role: UserRole.TEACHER,
              teacher_data: response.data
            },
            permissions: [],
            last_login: response.data.user?.last_login,
            created_by: undefined,
            is_suspended: false,
            suspension_reason: undefined,
            notes: undefined
          };
        } catch (teacherError) {
          const response = await api.get(`/api/parents/${userId}/`);
          return {
            id: response.data.id,
            user_data: {
              id: response.data.user?.id || response.data.id,
              email: response.data.user?.email || response.data.email,
              first_name: response.data.user?.first_name || response.data.first_name,
              last_name: response.data.user?.last_name || response.data.last_name,
              role: UserRole.PARENT,
              parent_data: response.data
            },
            permissions: [],
            last_login: response.data.user?.last_login,
            created_by: undefined,
            is_suspended: false,
            suspension_reason: undefined,
            notes: undefined
          };
        }
      }
    } catch (error) {
      console.error(`Failed to fetch user ${userId}:`, error);
      throw error;
    }
  };

  // Create new user
  const createUser = async (userData: UserCreationData): Promise<AdminUserManagement> => {
    try {
      if (!isAdmin()) throw new Error('Admin access required');
      
      const response = await api.post('/admin/users/', userData);
      return response.data;
    } catch (error) {
      console.error('Failed to create user:', error);
      throw error;
    }
  };

  // Update user
  const updateUser = async (userId: number, userData: UserUpdateData): Promise<AdminUserManagement> => {
    try {
      if (!isAdmin()) throw new Error('Admin access required');
      
      const response = await api.patch(`/admin/users/${userId}/`, userData);
      return response.data;
    } catch (error) {
      console.error(`Failed to update user ${userId}:`, error);
      throw error;
    }
  };

  // Delete user
  const deleteUser = async (userId: number): Promise<void> => {
    try {
      if (!isAdmin()) throw new Error('Admin access required');
      
      await api.delete(`/admin/users/${userId}/`);
    } catch (error) {
      console.error(`Failed to delete user ${userId}:`, error);
      throw error;
    }
  };

  // Suspend user
  const suspendUser = async (userId: number, reason?: string): Promise<void> => {
    try {
      if (!isAdmin()) throw new Error('Admin access required');
      
      await api.post(`/admin/users/${userId}/suspend/`, { reason });
    } catch (error) {
      console.error(`Failed to suspend user ${userId}:`, error);
      throw error;
    }
  };

  // Unsuspend user
  const unsuspendUser = async (userId: number): Promise<void> => {
    try {
      if (!isAdmin()) throw new Error('Admin access required');
      
      await api.post(`/admin/users/${userId}/unsuspend/`, {});
    } catch (error) {
      console.error(`Failed to unsuspend user ${userId}:`, error);
      throw error;
    }
  };

  // Reset user password
  const resetUserPassword = async (userId: number, newPassword?: string): Promise<{ temporary_password?: string }> => {
    try {
      if (!isAdmin()) throw new Error('Admin access required');
      
      const response = await api.post(`/admin/users/${userId}/reset_password/`, { new_password: newPassword });
      return response.data;
    } catch (error) {
      console.error(`Failed to reset password for user ${userId}:`, error);
      throw error;
    }
  };

  // Resolve user_id by username across students/teachers/parents
  const resolveUserIdByUsername = async (username: string): Promise<number | null> => {
    try {
      if (!isAdmin()) throw new Error('Admin access required');

      // Try students endpoint with multiple strategies
      const tryStudent = async (): Promise<number | null> => {
        try {
          // Attempt correct router path
          const res = await api.get('/api/students/students/', { params: { search: username } });
          const list: any[] = (res.results || res || []) as any[];
          const match = list.find((s: any) => (s.user?.username || s.username) === username);
          if (match?.user?.id) return Number(match.user.id);
          if (match?.id) return Number(match.id);
        } catch {}

        try {
          // Attempt username param
          const res2 = await api.get('/api/students/', { params: { username } });
          const list2: any[] = (res2.results || res2 || []) as any[];
          const match2 = list2.find((s: any) => (s.user?.username || s.username) === username);
          if (match2?.user?.id) return Number(match2.user.id);
          if (match2?.id) return Number(match2.id);
        } catch {}
        return null;
      };

      // Try teachers endpoint
      const tryTeacher = async (): Promise<number | null> => {
        try {
        // ✅ Correct
          const res = await api.get('/api/teachers/teachers/', { search: username });
          const list: any[] = (res.results || res || []) as any[];
          const match = list.find((t: any) => (t.user?.username || t.username) === username);
          if (match?.user?.id) return Number(match.user.id);
          if (match?.id) return Number(match.id);
        } catch {}
        return null;
      };

      // Try parents endpoint (if available)
      const tryParent = async (): Promise<number | null> => {
        try {
          let res: any = await api.get('/api/parents/parents/', { params: { search: username } });
          if (!Array.isArray(res) && !Array.isArray(res?.results)) {
            res = await api.get('/api/parents/', { params: { search: username } });
          }
          const list: any[] = (res.results || res || []) as any[];
          const match = list.find((p: any) => (p.user?.username || p.username) === username);
          if (match?.user?.id) return Number(match.user.id);
          if (match?.id) return Number(match.id);
        } catch {}
        return null;
      };

      // Route by known prefixes first for accuracy
      const prefix = (username.split('/')[0] || '').toUpperCase();
      if (prefix === 'TCH') {
        return (await tryTeacher()) || null;
      }
      if (prefix === 'STU') {
        return (await tryStudent()) || null;
      }
      if (prefix === 'PAR') {
        return (await tryParent()) || null;
      }
      // ADM or unknown: try all
      return (await tryTeacher())
        || (await tryStudent())
        || (await tryParent())
        || null;
    } catch (e) {
      console.error('Failed to resolve user by username:', e);
      return null;
    }
  };

  // Reset password by username convenience helper
  const resetPasswordByUsername = async (username: string, newPassword: string): Promise<{ user_id: number }> => {
    if (!isAdmin()) throw new Error('Admin access required');
    const userId = await resolveUserIdByUsername(username);
    if (!userId) {
      throw new Error('Username not found');
    }
    await api.post('/api/auth/admin-reset-password/', { user_id: userId, new_password: newPassword });
    return { user_id: userId };
  };

  // Send verification email
  const sendVerificationEmail = async (userId: number): Promise<void> => {
    try {
      if (!isAdmin()) throw new Error('Admin access required');
      
      await api.post(`/admin/users/${userId}/send_verification/`, {});
    } catch (error) {
      console.error(`Failed to send verification email to user ${userId}:`, error);
      throw error;
    }
  };

  // Verify user manually
  const verifyUserManually = async (userId: number): Promise<void> => {
    try {
      if (!isAdmin()) throw new Error('Admin access required');
      
      await api.post(`/admin/users/${userId}/verify/`, {});
    } catch (error) {
      console.error(`Failed to verify user ${userId}:`, error);
      throw error;
    }
  };

  // ============================================
  // PROFILE MANAGEMENT METHODS
  // ============================================

  // Get user profile
  const getUserProfile = async (userId: number): Promise<UserProfile> => {
    try {
      if (!isAdmin()) throw new Error('Admin access required');
      
      // Try to get profile from userprofile endpoint
      const response = await api.get(`/api/profiles/profiles/${userId}/`);
      return response.data;
    } catch (error) {
      console.error(`Failed to fetch profile for user ${userId}:`, error);
      throw error;
    }
  };

  // Update user profile
  const updateUserProfile = async (userId: number, profileData: Partial<UserProfile>): Promise<UserProfile> => {
    try {
      if (!isAdmin()) throw new Error('Admin access required');
      
      const response = await api.patch(`/admin/users/${userId}/profile/`, profileData);
      return response.data;
    } catch (error) {
      console.error(`Failed to update profile for user ${userId}:`, error);
      throw error;
    }
  };

  // Upload profile picture for user
  const uploadUserProfilePicture = async (userId: number, file: File): Promise<string> => {
    try {
      if (!isAdmin()) throw new Error('Admin access required');
      
      const formData = new FormData();
      formData.append('profile_image', file);
      
     const response = await (api as any).post(
  `/admin/users/${userId}/profile_picture/`,
  formData,
  { headers: { 'Content-Type': 'multipart/form-data' } }
);
      // const response = await api.post(`/admin/users/${userId}/profile_picture/`, formData, {
      //   headers?: {
      //     'Content-Type': 'multipart/form-data',
      //   },
      // });
      
      return response.data.profile_picture_url;
    } catch (error) {
      console.error(`Failed to upload profile picture for user ${userId}:`, error);
      throw error;
    }
  };

  // Get user verification status
  const getUserVerificationStatus = async (userId: number): Promise<UserVerificationStatus> => {
    try {
      if (!isAdmin()) throw new Error('Admin access required');
      
      const response = await api.get(`/admin/users/${userId}/verification_status/`);
      return response.data;
    } catch (error) {
      console.error(`Failed to fetch verification status for user ${userId}:`, error);
      throw error;
    }
  };

  // Get user contact info
  const getUserContactInfo = async (userId: number): Promise<UserContactInfo> => {
    try {
      if (!isAdmin()) throw new Error('Admin access required');
      
      const response = await api.get(`/admin/users/${userId}/contact_info/`);
      return response.data;
    } catch (error) {
      console.error(`Failed to fetch contact info for user ${userId}:`, error);
      throw error;
    }
  };

  // ============================================
  // DASHBOARD AND ANALYTICS METHODS
  // ============================================

  // Get dashboard statistics
  const getDashboardStats = async (): Promise<AdminDashboardStats> => {
    try {
      if (!isAdmin()) throw new Error('Admin access required');
      
                    const response = await api.get('/api/dashboard/stats/');
       return response;
    } catch (error) {
      console.error('Failed to fetch dashboard stats:', error);
      throw error;
    }
  };

  // Get audit logs
  const getAuditLogs = async (params?: {
    page?: number;
    limit?: number;
    admin_user?: number;
    action?: string;
    start_date?: string;
    end_date?: string;
  }): Promise<{
    logs: AdminAuditLog[];
    total: number;
    page: number;
    total_pages: number;
  }> => {
    try {
      if (!isAdmin()) throw new Error('Admin access required');
      
      const response = await api.get('/admin/audit_logs/', params);
      return response.data;
    } catch (error) {
      console.error('Failed to fetch audit logs:', error);
      throw error;
    }
  };

  // Export user data
  const exportUsers = async (format: 'csv' | 'excel' = 'csv', filters?: {
    role?: UserRole;
    is_active?: boolean;
    start_date?: string;
    end_date?: string;
  }): Promise<Blob> => {
    try {
      if (!isAdmin()) throw new Error('Admin access required');
      
      const response = await api.get('/admin/users/export/', {
        params: { format, ...filters },
        responseType: 'blob',
      });
      return response.data;
    } catch (error) {
      console.error('Failed to export users:', error);
      throw error;
    }
  };

  // Bulk actions
  const bulkUpdateUsers = async (userIds: number[], updates: UserUpdateData): Promise<void> => {
    try {
      if (!isAdmin()) throw new Error('Admin access required');
      
      await api.post('/admin/users/bulk_update/', {
        user_ids: userIds,
        updates,
      });
    } catch (error) {
      console.error('Failed to bulk update users:', error);
      throw error;
    }
  };

  // Bulk delete users
  const bulkDeleteUsers = async (userIds: number[]): Promise<void> => {
    try {
      if (!isAdmin()) throw new Error('Admin access required');
      
      await api.post('/admin/users/bulk_delete/', {
        user_ids: userIds,
      });
    } catch (error) {
      console.error('Failed to bulk delete users:', error);
      throw error;
    }
  };

  // Activate/deactivate a student (studentId, userId, isActive)
  const activateStudent = async (studentId: number, userId: number, isActive: boolean = true): Promise<void> => {
    try {
      console.log(`🔄 Activating/deactivating student: ${studentId}, isActive: ${isActive}`);
      
      // Use the new toggle_status endpoint that handles both user and student profile
      const response = await api.post(`/api/students/${studentId}/toggle_status/`, {});
      console.log('✅ Student activation response:', response);
      
      // The endpoint returns the new status, so we can verify it worked
      if (response.data && response.data.is_active !== isActive) {
        console.warn('⚠️ Status mismatch - expected:', isActive, 'got:', response.data.is_active);
      }
    } catch (error) {
      console.error('❌ Error activating/deactivating student:', error);
      throw error;
    }
  };

  // Activate/deactivate a teacher (userId)
  const activateTeacher = async (userId: number, isActive: boolean = true): Promise<void> => {
    try {
      console.log(`🔄 Activating/deactivating teacher: ${userId}, isActive: ${isActive}`);
      
      const response = await api.patch(`/api/auth/users/${userId}/activate/`, { is_active: isActive });
      console.log('✅ Teacher activation response:', response);
    } catch (error) {
      console.error('❌ Error activating/deactivating teacher:', error);
      throw error;
    }
  };

  // Activate/deactivate a parent (userId)
  const activateParent = async (userId: number, isActive: boolean = true): Promise<void> => {
    try {
      console.log(`🔄 Activating/deactivating parent: ${userId}, isActive: ${isActive}`);
      
      const response = await api.patch(`/api/auth/users/${userId}/activate/`, { is_active: isActive });
      console.log('✅ Parent activation response:', response);
    } catch (error) {
      console.error('❌ Error activating/deactivating parent:', error);
      throw error;
    }
  };

  // Return all methods including base auth methods
  return {
    // Base auth methods from useAuth
    ...baseAuth,
    
    // Admin-specific methods
    isAdmin,
    adminLogin,
    
    // User management
    getUsers,
    getUser,
    createUser,
    updateUser,
    deleteUser,
    suspendUser,
    unsuspendUser,
    resetUserPassword,
    sendVerificationEmail,
    verifyUserManually,
    
    // Profile management (admin versions)
    getUserProfile,
    updateUserProfile,
    uploadUserProfilePicture,
    getUserVerificationStatus,
    getUserContactInfo,
    
    // Dashboard and analytics
    getDashboardStats,
    getAuditLogs,
    exportUsers,
    bulkUpdateUsers,
    bulkDeleteUsers,
    activateStudent,
    activateTeacher,
    activateParent,
  };
}

// Export types for use in other files
export type {
  AdminUserManagement,
  UserCreationData,
  UserUpdateData,
  AdminDashboardStats,
  AdminAuditLog,
};