import React from 'react';
import EnhancedDashboard from './EnhancedDashboard';

interface DashboardMainContentProps {
  dashboardStats: any;
  students: any;
  teachers: any;
  attendanceData: any;
  classrooms: any;
  recentActivities: any;
  parents: any;
  gradeDistribution: any;
  onRefresh?: () => void;
  onUserStatusUpdate?: (userId: number, userType: 'student' | 'teacher' | 'parent', isActive: boolean) => void;
  user?: any;
  activateStudent?: (studentId: number) => Promise<void>;
  activateTeacher?: (teacherId: number) => Promise<void>;
  activateParent?: (parentId: number) => Promise<void>;
}

const DashboardMainContent: React.FC<DashboardMainContentProps> = (props) => {
  
  return <EnhancedDashboard {...props} />;
};

export default DashboardMainContent; 