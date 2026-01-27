import { useEffect, useState } from 'react';
import ParentLayout from '@/components/layouts/ParentLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  User,
  GraduationCap,
  Calendar,
  TrendingUp,
  TrendingDown,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
} from 'lucide-react';
import api from '@/services/api';
import { toast } from 'react-toastify';

interface StudentData {
  student_id: number;
  student: string;
  attendance_percentage: number;
  average_score: number;
  recent_attendance: Array<{
    date: string;
    status: string;
  }>;
  recent_results: Array<{
    subject: string;
    score: number;
    exam_date: string;
  }>;
  alert: string | null;
}

interface DashboardResponse {
  dashboard: StudentData[];
}

const ParentDashboard = () => {
  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState<StudentData[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<number | null>(null);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const response = await api.get<DashboardResponse>('/api/parents/dashboard/');
      setDashboardData(response.dashboard || []);

      // Auto-select first student if available
      if (response.dashboard && response.dashboard.length > 0) {
        setSelectedStudent(response.dashboard[0].student_id);
      }
    } catch (error: any) {
      console.error('Error fetching parent dashboard:', error);
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const getAttendanceColor = (percentage: number) => {
    if (percentage >= 90) return 'text-green-600 bg-green-50';
    if (percentage >= 75) return 'text-yellow-600 bg-yellow-50';
    return 'text-red-600 bg-red-50';
  };

  const getScoreColor = (score: number) => {
    if (score >= 70) return 'text-green-600 bg-green-50';
    if (score >= 50) return 'text-yellow-600 bg-yellow-50';
    return 'text-red-600 bg-red-50';
  };

  const getAttendanceStatusIcon = (status: string) => {
    switch (status.toLowerCase()) {
      case 'present':
      case 'p':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'absent':
      case 'a':
        return <XCircle className="w-4 h-4 text-red-600" />;
      case 'late':
      case 'l':
        return <Clock className="w-4 h-4 text-yellow-600" />;
      default:
        return <AlertTriangle className="w-4 h-4 text-gray-400" />;
    }
  };

  if (loading) {
    return (
      <ParentLayout>
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-600 dark:text-gray-400">Loading dashboard...</p>
          </div>
        </div>
      </ParentLayout>
    );
  }

  if (!dashboardData || dashboardData.length === 0) {
    return (
      <ParentLayout>
        <div className="p-6 max-w-7xl mx-auto">
          <Card>
            <CardContent className="py-12 text-center">
              <User className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                No Students Linked
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                You don't have any students linked to your account yet.
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-500">
                Please contact the school administrator to link your child's profile.
              </p>
            </CardContent>
          </Card>
        </div>
      </ParentLayout>
    );
  }

  const currentStudent = dashboardData.find(s => s.student_id === selectedStudent) || dashboardData[0];

  return (
    <ParentLayout>
      <div className="p-6 max-w-7xl mx-auto">
        {/* Student Selector */}
        {dashboardData.length > 1 && (
          <div className="mb-6">
            <div className="flex gap-2 overflow-x-auto pb-2">
              {dashboardData.map((student) => (
                <Button
                  key={student.student_id}
                  onClick={() => setSelectedStudent(student.student_id)}
                  variant={selectedStudent === student.student_id ? 'default' : 'outline'}
                  className="whitespace-nowrap"
                >
                  <User className="w-4 h-4 mr-2" />
                  {student.student}
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Alert if exists */}
        {currentStudent.alert && (
          <Alert className="mb-6 border-yellow-200 bg-yellow-50 dark:bg-yellow-950/20">
            <AlertTriangle className="h-4 w-4 text-yellow-600" />
            <AlertDescription className="text-yellow-800 dark:text-yellow-200">
              {currentStudent.alert}
            </AlertDescription>
          </Alert>
        )}

        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {/* Attendance Card */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
                Attendance Rate
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline gap-2">
                <span className={`text-3xl font-bold ${getAttendanceColor(currentStudent.attendance_percentage)}`}>
                  {currentStudent.attendance_percentage.toFixed(1)}%
                </span>
                {currentStudent.attendance_percentage >= 90 ? (
                  <TrendingUp className="w-5 h-5 text-green-600" />
                ) : (
                  <TrendingDown className="w-5 h-5 text-red-600" />
                )}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                {currentStudent.attendance_percentage >= 90 ? 'Excellent attendance' : 'Needs improvement'}
              </p>
            </CardContent>
          </Card>

          {/* Academic Performance Card */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
                Average Score
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline gap-2">
                <span className={`text-3xl font-bold ${getScoreColor(currentStudent.average_score)}`}>
                  {currentStudent.average_score.toFixed(1)}%
                </span>
                {currentStudent.average_score >= 70 ? (
                  <TrendingUp className="w-5 h-5 text-green-600" />
                ) : (
                  <TrendingDown className="w-5 h-5 text-red-600" />
                )}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                {currentStudent.average_score >= 70 ? 'Strong performance' : 'Could improve'}
              </p>
            </CardContent>
          </Card>

          {/* Student Info Card */}
          <Card className="md:col-span-2 lg:col-span-1">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
                Student
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                  <User className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900 dark:text-white">{currentStudent.student}</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">ID: {currentStudent.student_id}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Detailed Views */}
        <Tabs defaultValue="attendance" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2 lg:w-auto">
            <TabsTrigger value="attendance">Attendance</TabsTrigger>
            <TabsTrigger value="results">Academic Results</TabsTrigger>
          </TabsList>

          {/* Attendance Tab */}
          <TabsContent value="attendance">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="w-5 h-5" />
                  Recent Attendance
                </CardTitle>
                <CardDescription>
                  Last {currentStudent.recent_attendance.length} attendance records
                </CardDescription>
              </CardHeader>
              <CardContent>
                {currentStudent.recent_attendance.length > 0 ? (
                  <div className="space-y-3">
                    {currentStudent.recent_attendance.map((record, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          {getAttendanceStatusIcon(record.status)}
                          <div>
                            <p className="text-sm font-medium text-gray-900 dark:text-white capitalize">
                              {record.status}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {new Date(record.date).toLocaleDateString('en-US', {
                                weekday: 'short',
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric'
                              })}
                            </p>
                          </div>
                        </div>
                        <Badge
                          variant={record.status.toLowerCase() === 'present' || record.status.toLowerCase() === 'p' ? 'default' : 'destructive'}
                        >
                          {record.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                    <Calendar className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                    <p>No attendance records available</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Results Tab */}
          <TabsContent value="results">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <GraduationCap className="w-5 h-5" />
                  Recent Results
                </CardTitle>
                <CardDescription>
                  Last {currentStudent.recent_results.length} exam results
                </CardDescription>
              </CardHeader>
              <CardContent>
                {currentStudent.recent_results.length > 0 ? (
                  <div className="space-y-3">
                    {currentStudent.recent_results.map((result, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-900 rounded-lg"
                      >
                        <div className="flex-1">
                          <p className="font-medium text-gray-900 dark:text-white">
                            {result.subject}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {result.exam_date ? new Date(result.exam_date).toLocaleDateString('en-US', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric'
                            }) : 'N/A'}
                          </p>
                        </div>
                        <div className="text-right">
                          <div className={`text-2xl font-bold ${getScoreColor(result.score)}`}>
                            {result.score}%
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                    <GraduationCap className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                    <p>No exam results available</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </ParentLayout>
  );
};

export default ParentDashboard;
