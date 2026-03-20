import React, { useState, useEffect, useCallback } from 'react';
// import DashboardMainContent from '@/components/dashboards/admin/DashboardMainContent';
import AdminDashboard from '@/components/dashboards/admin/Admin';
import { useAdminAuth } from '@/services/AuthServiceAdmin';
import api from '@/services/api';
import { useDashboardRefresh } from '@/hooks/useDashboardRefresh';
import {
  UserProfile,
  AdminDashboardStats,
  AdminUserManagement,
  UserRole,
 
  Student,
  Teacher,
  Message,
  Classroom,
  DashboardStats,
  AttendanceData,
  ChangeType,
  Gender,
  StudentStatus,
  FeeStatus,
  EmploymentStatus
} from '@/types/types';
import { Outlet } from 'react-router-dom';

// Dashboard data interface
interface DashboardData {
  dashboardStats: DashboardStats | null;
  students: Student[] | null;
  teachers: Teacher[] | null;
  parents: any[] | null;
  attendanceData: AttendanceData | null;
  classrooms: Classroom[] | null;
  messages: Message[] | null;
  userProfile: UserProfile | null;
  loading: boolean;
  error: string | null;
}

const DashboardHome: React.FC = () => {
  const {
    user,
    isAuthenticated,
    logout,
    isAdmin,
    getUsers,
    getDashboardStats,
    getUserProfile,
    // updateUserProfile,
    // createUser,
    // updateUser,
    // deleteUser,
    // bulkUpdateUsers,
    // exportUsers,
    // resetUserPassword,
    // suspendUser,
    // unsuspendUser,
  } = useAdminAuth();

  const [dashboardData, setDashboardData] = useState<DashboardData>({
    dashboardStats: null,
    students: null,
    teachers: null,
    parents: null,
    attendanceData: null,
    classrooms: null,
    messages: null,
    userProfile: null,
    loading: true,
    error: null
  });

  // Debug authentication state
  console.log('DashboardHome - Authentication state:', {
    isAuthenticated,
    user,
    isAdmin: isAdmin()
  });

  const [refreshKey, setRefreshKey] = useState<number>(0);

  // Helper function to fetch user profile
  const fetchEnhancedUserProfile = async (userId: number) => {
    try {
      return await getUserProfile(userId);
    } catch (error) {
      throw error;
    }
  };

  const mapToStudentsEnhanced = async (adminUsers: AdminUserManagement[]): Promise<Student[]> => {
    const students = await Promise.all(
      adminUsers
        .filter(user => user.user_data.role === UserRole.STUDENT)
        .map(async (user) => {
          const studentData = (user.user_data as any).student_data;

          const student: Student = {
            id: studentData?.id || user.id,
            user: user.user_data,
            username: user.user_data.username || `user${user.id}`,
            student_id: studentData?.student_id || `STU${user.id}`,
            gender: studentData?.gender || 'not_specified' as Gender,
            date_of_birth: studentData?.date_of_birth || new Date().toISOString(),
            admission_date: studentData?.admission_date || new Date().toISOString(),
            graduation_date: studentData?.graduation_date,
            current_grade_level: studentData?.current_grade_level || 'Grade 1',
            current_section: studentData?.current_section || 'A',
            section: studentData?.section || 'A',
            grade: studentData?.grade || '1',
            class: studentData?.class || '1A',
            // Add education level mapping
            education_level: studentData?.education_level || 'PRIMARY',
            education_level_display: studentData?.education_level_display || 'Primary',
            student_class: studentData?.student_class || 'PRIMARY_1',
            roll_number: studentData?.roll_number || `R${user.id}`,
            academic_year: studentData?.academic_year || new Date().getFullYear().toString(),
            emergency_contact_name: studentData?.emergency_contact_name || '',
            emergency_contact_phone: studentData?.emergency_contact_phone || '',
            emergency_contact_relationship: studentData?.emergency_contact_relationship || '',
            guardian_name: studentData?.guardian_name || '',
            guardian_phone: studentData?.guardian_phone || '',
            guardian_email: studentData?.guardian_email || '',
            parent_contact: studentData?.parent_contact || '',
            emergency_contact: studentData?.emergency_contact || '',
            enrollment_status: studentData?.enrollment_status || 'active',
            status: studentData?.status || 'active' as StudentStatus,
            enrollment_date: studentData?.enrollment_date || new Date().toISOString(),
            address: studentData?.address || '',
            blood_group: studentData?.blood_group || '',
            medical_conditions: studentData?.medical_conditions || '',
            medical_info: studentData?.medical_info || '',
            allergies: studentData?.allergies || '',
            special_needs: studentData?.special_needs || '',
            previous_school: studentData?.previous_school || '',
            transfer_certificate: studentData?.transfer_certificate || '',
            fee_status: studentData?.fee_status || 'pending' as FeeStatus,
            transport_required: studentData?.transport_required || false,
            hostel_required: studentData?.hostel_required || false,
            extracurricular_activities: studentData?.extracurricular_activities || [],
            disciplinary_records: studentData?.disciplinary_records || [],
            attendance_percentage: studentData?.attendance_percentage || 0,
            full_name: `${user.user_data.first_name} ${user.user_data.last_name}`,
            age: studentData?.age || 0,
            years_enrolled: studentData?.years_enrolled || 0,
            created_at: user.user_data.created_at || studentData?.created_at || new Date().toISOString(),
            updated_at: user.user_data.updated_at || studentData?.updated_at || new Date().toISOString(),
            // Pass is_active for activation status
            is_active: user.user_data.is_active !== undefined ? user.user_data.is_active : true,
          };
          return student;
        })
    );
    // Sort by created_at (registration date) descending
    students.sort((a, b) => new Date(b.created_at || '').getTime() - new Date(a.created_at || '').getTime());
    return students;
  };

  const mapToTeachersEnhanced = async (adminUsers: AdminUserManagement[]): Promise<Teacher[]> => {
    return Promise.all(
      adminUsers
        .filter(user => user.user_data.role === UserRole.TEACHER)
        .map(async (user) => {
          const teacherData = (user.user_data as any).teacher_data;
          const teacher: Teacher = {
            id: teacherData?.id || user.id,
            user: user.user_data,
            employee_id: teacherData?.employee_id || `EMP${user.id}`,
            phone_number: teacherData?.phone_number || '',
            contact_number: teacherData?.contact_number || '',
            address: teacherData?.address || '',
            hire_date: teacherData?.hire_date || new Date().toISOString(),
            employment_status: teacherData?.employment_status || 'active' as EmploymentStatus,
            qualifications: teacherData?.qualifications || ['Bachelor\'s Degree'],
            qualification: teacherData?.qualification || 'Bachelor\'s Degree',
            specializations: teacherData?.specializations || ['General'],
            teaching_subjects: teacherData?.teaching_subjects || ['General'],
            years_experience: teacherData?.years_experience || 0,
            experience_years: teacherData?.experience_years || 0,
            salary_grade: teacherData?.salary_grade || '',
            salary: teacherData?.salary || 0,
            department: teacherData?.department || '',
            subject: teacherData?.subject || 'General',
            date_of_birth: teacherData?.date_of_birth || new Date().toISOString(),
            gender: teacherData?.gender || 'not_specified' as Gender,
            marital_status: teacherData?.marital_status || 'not_specified',
            blood_group: teacherData?.blood_group || '',
            previous_experience: teacherData?.previous_experience || '',
            class_teacher_of: teacherData?.class_teacher_of || '',
            performance_rating: teacherData?.performance_rating || 0,
            certifications: teacherData?.certifications || [],
            training_programs: teacherData?.training_programs || [],
            achievements: teacherData?.achievements || [],
            disciplinary_records: teacherData?.disciplinary_records || [],
            leave_balance: teacherData?.leave_balance || 0,
            attendance_percentage: teacherData?.attendance_percentage || 0,
            emergency_contact_name: teacherData?.emergency_contact_name || '',
            emergency_contact_phone: teacherData?.emergency_contact_phone || '',
            emergency_contact_relationship: teacherData?.emergency_contact_relationship || '',
            emergency_contact: teacherData?.emergency_contact || '',
            full_name: `${user.user_data.first_name} ${user.user_data.last_name}`,
            years_at_school: teacherData?.years_at_school || 0,
            created_at: user.user_data.created_at || new Date().toISOString(),
            updated_at: user.user_data.updated_at || new Date().toISOString(),
            // Pass is_active for activation status
            is_active: user.user_data.is_active !== undefined ? user.user_data.is_active : true,
          };
          return teacher;
        })
    );
  };

  const mapToParentsEnhanced = async (adminUsers: AdminUserManagement[]): Promise<any[]> => {
    return Promise.all(
      adminUsers
        .filter(user => user.user_data.role === UserRole.PARENT)
        .map(async (user) => {
          const parentData = (user.user_data as any).parent_data;
          const parent: any = {
            id: parentData?.id || user.id,
            user: user.user_data,
            parent_id: parentData?.parent_id || `PAR${user.id}`,
            occupation: parentData?.occupation || '',
            relationship_to_student: parentData?.relationship_to_student || 'other',
            children_ids: parentData?.children_ids || [],
            emergency_contact: parentData?.emergency_contact || '',
            work_address: parentData?.work_address || '',
            annual_income: parentData?.annual_income || 0,
            education_level: parentData?.education_level || '',
            marital_status: parentData?.marital_status || 'not_specified',
            children: parentData?.children || [],
            full_name: `${user.user_data.first_name} ${user.user_data.last_name}`,
            created_at: user.user_data.created_at || new Date().toISOString(),
            updated_at: user.user_data.updated_at || new Date().toISOString(),
            // Pass is_active for activation status
            is_active: user.user_data.is_active !== undefined ? user.user_data.is_active : true,
          };
          return parent;
        })
    );
  };

  const mapToDashboardStats = (adminStats: AdminDashboardStats): DashboardStats => {
    return {
      totalStudents: adminStats.total_students || 0,
      totalTeachers: adminStats.total_teachers || 0,
      totalClasses: adminStats.total_classes || 0,
      totalUsers: adminStats.total_users || 0,
      totalParents: adminStats.total_parents || 0,
      activeUsers: adminStats.active_students || adminStats.active_users || 0,
      inactiveUsers: adminStats.inactive_students || adminStats.inactive_users || 0,
      pendingVerifications: adminStats.pending_verifications || 0,
      recentRegistrations: adminStats.recent_registrations || 0
    };
  };

  // Replace fetchAttendanceData to use api instance
  const fetchAttendanceData = async (): Promise<AttendanceData> => {
    try {
      const response = await api.get('/api/attendance/attendance/');
      const attendanceRecords = response.data;
      return processAttendanceData(attendanceRecords);
    } catch (error) {
      return getDefaultAttendanceData();
    }
  };

  const processAttendanceData = (attendanceRecords: any[]): AttendanceData => {
    const currentDate = new Date();
    const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const attendanceByDate = attendanceRecords.reduce((acc: any, record: any) => {
      const date = record.date || record.attendance_date;
      if (!acc[date]) {
        acc[date] = { present: 0, absent: 0, late: 0, excused: 0 };
      }
      switch (record.status) {
        case 'P':
        case 'present':
          acc[date].present++;
          break;
        case 'A':
        case 'absent':
          acc[date].absent++;
          break;
        case 'L':
        case 'late':
          acc[date].late++;
          break;
        case 'E':
        case 'excused':
          acc[date].excused++;
          break;
      }
      return acc;
    }, {});
    const dailyAttendance = Object.entries(attendanceByDate).map(([date, counts]: [string, any]) => ({
      date,
      present: counts.present,
      absent: counts.absent,
      late: counts.late,
      excused: counts.excused,
      totalExpected: counts.present + counts.absent + counts.late + counts.excused,
      attendanceRate: counts.present / (counts.present + counts.absent + counts.late + counts.excused) * 100
    }));
    const totalPresent = dailyAttendance.reduce((sum, day) => sum + day.present, 0);
    const totalAbsent = dailyAttendance.reduce((sum, day) => sum + day.absent, 0);
    const totalLate = dailyAttendance.reduce((sum, day) => sum + day.late, 0);
    const totalExcused = dailyAttendance.reduce((sum, day) => sum + day.excused, 0);
    const totalStudents = totalPresent + totalAbsent + totalLate + totalExcused;
    return {
      totalPresent,
      totalAbsent,
      totalLate,
      totalExcused,
      totalUnexcused: totalAbsent,
      totalStudents,
      totalTeachers: 0,
      attendanceRate: totalStudents > 0 ? (totalPresent / totalStudents) * 100 : 0,
      absenteeRate: totalStudents > 0 ? (totalAbsent / totalStudents) * 100 : 0,
      lateRate: totalStudents > 0 ? (totalLate / totalStudents) * 100 : 0,
      excusedRate: totalStudents > 0 ? (totalExcused / totalStudents) * 100 : 0,
      dailyAttendance,
      weeklyAttendance: [],
      monthlyAttendance: [],
      classAttendance: [],
      studentAttendanceRecords: attendanceRecords,
      teacherAttendanceRecords: [],
      attendanceTrends: [],
      absenteeismPatterns: [],
      lowAttendanceAlerts: [],
      chronicAbsentees: [],
      previousPeriodComparison: {
        currentPeriod: {
          startDate: startOfMonth.toISOString(),
          endDate: currentDate.toISOString(),
          attendanceRate: totalStudents > 0 ? (totalPresent / totalStudents) * 100 : 0
        },
        previousPeriod: {
          startDate: new Date(startOfMonth.getFullYear(), startOfMonth.getMonth() - 1, 1).toISOString(),
          endDate: new Date(startOfMonth.getFullYear(), startOfMonth.getMonth(), 0).toISOString(),
          attendanceRate: 0
        },
        change: 0,
        changeType: ChangeType.STABLE
      },
      gradeComparison: [],
      reportPeriod: {
        startDate: startOfMonth.toISOString(),
        endDate: currentDate.toISOString(),
        totalDays: Math.ceil((currentDate.getTime() - startOfMonth.getTime()) / (1000 * 60 * 60 * 24)),
        schoolDays: Math.ceil((currentDate.getTime() - startOfMonth.getTime()) / (1000 * 60 * 60 * 24)),
        holidays: 0
      },
      lastUpdated: currentDate.toISOString(),
      generatedBy: 'Admin Dashboard',
      insights: [],
      recommendations: []
    };
  };

  const getDefaultAttendanceData = (): AttendanceData => {
    const currentDate = new Date();
    const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    return {
      totalPresent: 0,
      totalAbsent: 0,
      totalLate: 0,
      totalExcused: 0,
      totalUnexcused: 0,
      totalStudents: 0,
      totalTeachers: 0,
      attendanceRate: 0,
      absenteeRate: 0,
      lateRate: 0,
      excusedRate: 0,
      dailyAttendance: [],
      weeklyAttendance: [],
      monthlyAttendance: [],
      classAttendance: [],
      studentAttendanceRecords: [],
      teacherAttendanceRecords: [],
      attendanceTrends: [],
      absenteeismPatterns: [],
      lowAttendanceAlerts: [],
      chronicAbsentees: [],
      previousPeriodComparison: {
        currentPeriod: {
          startDate: startOfMonth.toISOString(),
          endDate: currentDate.toISOString(),
          attendanceRate: 0
        },
        previousPeriod: {
          startDate: new Date(startOfMonth.getFullYear(), startOfMonth.getMonth() - 1, 1).toISOString(),
          endDate: new Date(startOfMonth.getFullYear(), startOfMonth.getMonth(), 0).toISOString(),
          attendanceRate: 0
        },
        change: 0,
        changeType: ChangeType.STABLE
      },
      gradeComparison: [],
      reportPeriod: {
        startDate: startOfMonth.toISOString(),
        endDate: currentDate.toISOString(),
        totalDays: Math.ceil((currentDate.getTime() - startOfMonth.getTime()) / (1000 * 60 * 60 * 24)),
        schoolDays: Math.ceil((currentDate.getTime() - startOfMonth.getTime()) / (1000 * 60 * 60 * 24)),
        holidays: 0
      },
      lastUpdated: currentDate.toISOString(),
      generatedBy: 'System Default',
      insights: [],
      recommendations: []
    };
  };

  const fetchClassrooms = async (): Promise<Classroom[]> => {
    try {
      const response = await api.get('/api/classrooms/classrooms/'); // Fixed: use correct classrooms endpoint
      return response.data;
    } catch (error) {
      return [];
    }
  };

  const fetchMessages = async (): Promise<Message[]> => {
    try {
      const response = await api.get('/api/messaging/');
      return response.data;
    } catch (error) {
      return [];
    }
  };

  // Main fetch function - OPTIMIZED: Single API call instead of 8
  const fetchDashboardData = useCallback(async () => {
    try {
      setDashboardData(prev => ({ ...prev, loading: true, error: null }));
      if (!isAuthenticated || !user) {
        throw new Error('User not authenticated. Please login again.');
      }
      if (!isAdmin()) {
        throw new Error('Admin access required. Insufficient permissions.');
      }

      // 🚀 PERFORMANCE OPTIMIZED: Single API call instead of 8 separate calls
      // This reduces load time from 30-60 seconds to <2 seconds
      const response = await api.get('/api/dashboard/admin/optimized/', {
        params: {
          page: 1,
          page_size: 100
        }
      });

      const optimizedData = response.data;

      // Map the optimized response to DashboardData format
      const processedData: DashboardData = {
        dashboardStats: optimizedData.dashboardStats ? {
          totalStudents: optimizedData.dashboardStats.total_students || 0,
          totalTeachers: optimizedData.dashboardStats.total_teachers || 0,
          totalClasses: optimizedData.dashboardStats.total_classes || 0,
          totalUsers: optimizedData.dashboardStats.total_users || 0,
          totalParents: optimizedData.dashboardStats.total_parents || 0,
          activeUsers: optimizedData.dashboardStats.active_students || 0,
          inactiveUsers: optimizedData.dashboardStats.inactive_students || 0,
          pendingVerifications: optimizedData.dashboardStats.pending_verifications || 0,
          recentRegistrations: optimizedData.dashboardStats.recent_registrations || 0
        } : null,
        students: optimizedData.students?.results || null,
        teachers: optimizedData.teachers?.results || null,
        parents: optimizedData.parents?.results || null,
        attendanceData: optimizedData.attendanceData || null,
        classrooms: optimizedData.classrooms || null,
        messages: optimizedData.messages || null,
        userProfile: optimizedData.userProfile || null,
        loading: false,
        error: null
      };

      setDashboardData(processedData);
    } catch (error) {
      setDashboardData(prev => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : 'An unknown error occurred'
      }));
    }
  }, []);

  // Handlers
  const handleRefresh = useCallback(() => {
    setRefreshKey(prev => prev + 1);
  }, []);

  // Use dashboard refresh hook
  useDashboardRefresh(handleRefresh);

  const handleUserStatusUpdate = useCallback((userId: number, userType: 'student' | 'teacher' | 'parent', isActive: boolean) => {
    setDashboardData(prev => {
      const updateUserInArray = (users: any[] | null) => {
        if (!users || !Array.isArray(users)) return users;
        return users.map(user => {
          const userToCheck = user.user?.id || user.user_id || user.id;
          if (userToCheck === userId) {
            return {
              ...user,
              user: user.user ? { ...user.user, is_active: isActive } : undefined,
              is_active: isActive
            };
          }
          return user;
        });
      };

      return {
        ...prev,
        students: userType === 'student' ? updateUserInArray(prev.students) : prev.students,
        teachers: userType === 'teacher' ? updateUserInArray(prev.teachers) : prev.teachers,
        parents: userType === 'parent' ? updateUserInArray(prev.parents) : prev.parents,
      };
    });
  }, []);

  const handleLogout = useCallback(() => {
    logout();
  }, [logout]);

  // Effect for initial data fetch
  useEffect(() => {
    fetchDashboardData();
  }, [refreshKey]);

  // Loading state
  if (dashboardData.loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-gray-200 border-t-gray-800 rounded-full animate-spin mx-auto" />
          <p className="text-sm text-gray-500 mt-4">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (dashboardData.error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="text-center max-w-sm">
          <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h3 className="text-base font-semibold text-gray-900 mb-2">Something went wrong</h3>
          <p className="text-sm text-gray-500 mb-4">{dashboardData.error}</p>
          <button
            onClick={() => setRefreshKey(prev => prev + 1)}
            className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  // Main dashboard render with sidebar/layout
  return (
    <AdminDashboard
      dashboardStats={dashboardData.dashboardStats}
      students={dashboardData.students}
      teachers={dashboardData.teachers}
      parents={dashboardData.parents}
      attendanceData={dashboardData.attendanceData}
      classrooms={dashboardData.classrooms}
      messages={dashboardData.messages}
      userProfile={dashboardData.userProfile}
      notificationCount={0}
      messageCount={0}
      onRefresh={() => setRefreshKey(prev => prev + 1)}
      currentUser={user}
      onLogout={logout}
      isAdmin={isAdmin()}
      adminMethods={{ getUsers, getDashboardStats, getUserProfile }}
    >
      <Outlet />
    </AdminDashboard>
  );
};

export default DashboardHome; 