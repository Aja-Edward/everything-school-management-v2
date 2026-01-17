// import DashboardMainContent from '../../components/dashboards/admin/DashboardMainContent';
// import { Student, Teacher, Classroom, AttendanceData, DashboardStats, Parent } from '../../types/types';
// import { useEffect, useState, useCallback } from 'react';
// import { useAuth } from '../../hooks/useAuth';
// import api from '@/services/api';

// const AdminDashboardContentLoader = () => {
//   const { user } = useAuth();
//   const [dashboardStats, setDashboardStats] = useState<DashboardStats>({} as DashboardStats);
//   const [students, setStudents] = useState<Student[]>([]);
//   const [teachers, setTeachers] = useState<Teacher[]>([]);
//   const [attendanceData, setAttendanceData] = useState<AttendanceData>({} as AttendanceData);
//   const [classrooms, setClassrooms] = useState<Classroom[]>([]);
//   const [parents, setParents] = useState<Parent[]>([]);
//   const [loading, setLoading] = useState(true);
//   const [refreshKey, setRefreshKey] = useState(0);

//   // Refresh function
//   const handleRefresh = useCallback(() => {
//     console.log('🔄 AdminDashboardContentLoader: Refresh triggered');
//     setRefreshKey(prev => prev + 1);
//   }, []);

//   // Handle user status updates
//   const handleUserStatusUpdate = (userId: number, userType: 'student' | 'teacher' | 'parent', isActive: boolean) => {
//     const updateUserInArray = (users: any[]) => {
//       return users.map(user => {
//         const userToCheck = user.user?.id || user.user_id || user.id;
//         if (userToCheck === userId) {
//           return {
//             ...user,
//             user: user.user ? { ...user.user, is_active: isActive } : undefined,
//             is_active: isActive
//           };
//         }
//         return user;
//       });
//     };

//     if (userType === 'student') {
//       setStudents(prev => updateUserInArray(prev));
//     } else if (userType === 'teacher') {
//       setTeachers(prev => updateUserInArray(prev));
//     } else if (userType === 'parent') {
//       setParents(prev => updateUserInArray(prev));
//     }
//   };

//   useEffect(() => {
//     setLoading(true);
//     console.log('🔄 AdminDashboardContentLoader: Starting data fetch...');
    
//     Promise.all([
//       api.get('/api/parents/'),
//       api.get('/api/students/students/'), 
//       api.get('/api/teachers/teachers/'), 
//       api.get('/api/attendance/'),
//       api.get('/api/classrooms/classrooms/'), 
//       api.get('/api/dashboard/stats/'),
//     ])
//       .then(([parentsRes, studentsRes, teachersRes, attendanceRes, classroomsRes, statsRes]) => {
//         console.log('📊 AdminDashboardContentLoader: Raw API responses:');
//         console.log('Parents response:', parentsRes);
       
        
//         // Process and set data
//         const processedParents = parentsRes.results || parentsRes || [];
//         const processedStudents = studentsRes.results || studentsRes || [];
//         const processedTeachers = teachersRes.results || teachersRes || [];
//         const processedAttendance = attendanceRes || {};
//         const processedClassrooms = classroomsRes.results || classroomsRes || [];
//         const processedStats = statsRes || {};
        
//         console.log('🔧 AdminDashboardContentLoader: Processed data:');
//         console.log('Processed Parents:', processedParents);
    
        
//         setParents(processedParents);
//         setStudents(processedStudents);
//         setTeachers(processedTeachers);
//         setAttendanceData(processedAttendance);
//         setClassrooms(processedClassrooms);
//         setDashboardStats(processedStats);
        
//         console.log('goodAdminDashboardContentLoader: Data set to state successfully');
//       })
//       .catch((error) => {
//         console.error('❌ AdminDashboardContentLoader: Error fetching data:', error);
//         setParents([]);
//         setStudents([]);
//         setTeachers([]);
//         setAttendanceData({} as AttendanceData);
//         setClassrooms([]);
//         setDashboardStats({} as DashboardStats);
//       })
//       .finally(() => {
//         setLoading(false);
//         console.log('🏁 AdminDashboardContentLoader: Loading completed');
//       });
//   }, [refreshKey]);

//   if (loading) {
//     return (
//       <div className="flex justify-center items-center h-full min-h-[400px]">
//         <div className="text-center">
//           <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-2"></div>
//           <div className="text-sm text-gray-600">Loading dashboard content...</div>
//         </div>
//       </div>
//     );
//   }

//   return (
//     <DashboardMainContent
//       dashboardStats={dashboardStats}
//       students={students}
//       teachers={teachers}
//       attendanceData={attendanceData}
//       classrooms={classrooms}
//       parents={parents}
//       onRefresh={handleRefresh}
//       onUserStatusUpdate={handleUserStatusUpdate}
//       user={user}
//       activateStudent={async () => {}}
//       activateTeacher={async () => {}}
//       activateParent={async () => {}}
//     />
//   );
// };
// export default AdminDashboardContentLoader; 



import DashboardMainContent from '../../components/dashboards/admin/DashboardMainContent';
import { Student, Teacher, Classroom, AttendanceData, DashboardStats, Parent, TrendDirection } from '../../types/types';
import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../../hooks/useAuth';
import api from '@/services/api';

const AdminDashboardContentLoader = () => {
  const { user } = useAuth();
  const [dashboardStats, setDashboardStats] = useState<DashboardStats>({} as DashboardStats);
  const [students, setStudents] = useState<Student[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [attendanceData, setAttendanceData] = useState<AttendanceData>({} as AttendanceData);
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [parents, setParents] = useState<Parent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  // Refresh function
  const handleRefresh = useCallback(() => {
    console.log('🔄 AdminDashboardContentLoader: Refresh triggered');
    setRefreshKey(prev => prev + 1);
  }, []);

  // Handle user status updates
  const handleUserStatusUpdate = (userId: number, userType: 'student' | 'teacher' | 'parent', isActive: boolean) => {
    const updateUserInArray = (users: any[]) => {
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

    if (userType === 'student') {
      setStudents(prev => updateUserInArray(prev));
    } else if (userType === 'teacher') {
      setTeachers(prev => updateUserInArray(prev));
    } else if (userType === 'parent') {
      setParents(prev => updateUserInArray(prev));
    }
  };

  useEffect(() => {
    setLoading(true);
    console.log('🔄 AdminDashboardContentLoader: Starting data fetch...');
    
    Promise.all([
      api.get('/api/parents/'),
      api.get('/api/students/students/'), 
      api.get('/api/teachers/teachers/'), 
      api.get('/api/attendance/'),
      api.get('/api/classrooms/classrooms/'),
      // ✅ CHANGED: Use new unified dashboard endpoint
      api.get('/api/dashboard/admin/summary/'),
    ])
      .then(([parentsRes, studentsRes, teachersRes, attendanceRes, classroomsRes, dashboardRes]) => {
        console.log('📊 AdminDashboardContentLoader: Raw API responses:');
        console.log('Dashboard response:', dashboardRes);
       
        // Process lists data
        const processedParents = parentsRes.results || parentsRes || [];
        const processedStudents = studentsRes.results || studentsRes || [];
        const processedTeachers = teachersRes.results || teachersRes || [];
        const processedAttendance = attendanceRes || {};
        const processedClassrooms = classroomsRes.results || classroomsRes || [];
        
        // ✅ CHANGED: Transform new dashboard structure to match DashboardStats format
        const transformedStats: DashboardStats = {
          overview: {
            total_students: dashboardRes.stats?.students?.total || 0,
            total_teachers: dashboardRes.stats?.teachers?.total || 0,
            total_parents: dashboardRes.stats?.parents?.total || 0,
            total_subjects: 0, // Not provided by new endpoint
            total_classes: dashboardRes.stats?.classrooms || 0,
            active_academic_year: new Date().getFullYear().toString(),
          },
          totalStudents: dashboardRes.stats?.students?.total || 0,
          totalTeachers: dashboardRes.stats?.teachers?.total || 0,
          totalClasses: dashboardRes.stats?.classrooms || 0,
          totalParents: dashboardRes.stats?.parents?.total || 0,
          totalUsers: (dashboardRes.stats?.students?.total || 0) + 
                      (dashboardRes.stats?.teachers?.total || 0) + 
                      (dashboardRes.stats?.parents?.total || 0),
          activeUsers: (dashboardRes.stats?.students?.active || 0) + 
                       (dashboardRes.stats?.teachers?.active || 0) + 
                       (dashboardRes.stats?.parents?.active || 0),
          inactiveUsers: (dashboardRes.stats?.students?.inactive || 0) + 
                         (dashboardRes.stats?.teachers?.inactive || 0),
          pendingVerifications: 0, // Not provided by new endpoint
          recentRegistrations: 0, // Not provided by new endpoint
          recent_activities: [], // Not provided in initial load
          upcoming_events: [], // Not provided in initial load
          alerts: dashboardRes.alerts || [],
          quick_stats: [
            {
              label: 'Attendance Today',
              value: `${dashboardRes.attendance_today?.rate || 0}%`,
              trend: TrendDirection.STABLE,
            },
            {
              label: 'Present Today',
              value: dashboardRes.attendance_today?.present || 0,
              trend: TrendDirection.STABLE,
            },
            {
              label: 'Lessons Today',
              value: dashboardRes.lessons_today?.total || 0,
              trend: TrendDirection.STABLE,
            },
          ],
        };
        
        console.log('🔧 AdminDashboardContentLoader: Transformed stats:', transformedStats);
        
        setParents(processedParents);
        setStudents(processedStudents);
        setTeachers(processedTeachers);
        setAttendanceData(processedAttendance);
        setClassrooms(processedClassrooms);
        setDashboardStats(transformedStats);
        
        console.log('✅ AdminDashboardContentLoader: Data set to state successfully');
      })
      .catch((error) => {
        console.error('❌ AdminDashboardContentLoader: Error fetching data:', error);
        setParents([]);
        setStudents([]);
        setTeachers([]);
        setAttendanceData({} as AttendanceData);
        setClassrooms([]);
        setDashboardStats({} as DashboardStats);
      })
      .finally(() => {
        setLoading(false);
        console.log('🏁 AdminDashboardContentLoader: Loading completed');
      });
  }, [refreshKey]);

  if (loading) {
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
            Loading dashboard
            <span className="animate-pulse">...</span>
          </p>
        </div>
      </div>
    );
  }

  return (
    <DashboardMainContent
      dashboardStats={dashboardStats}
      students={students}
      teachers={teachers}
      attendanceData={attendanceData}
      classrooms={classrooms}
      parents={parents}
      onRefresh={handleRefresh}
      onUserStatusUpdate={handleUserStatusUpdate}
      user={user}
      activateStudent={async () => {}}
      activateTeacher={async () => {}}
      activateParent={async () => {}}
    />
  );
};

export default AdminDashboardContentLoader;