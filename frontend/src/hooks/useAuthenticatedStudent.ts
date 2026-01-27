import { useState, useEffect } from 'react';
import api from '@/services/api';

interface AuthenticatedStudentData {
  authenticatedStudentId: string | null;
  studentRecord: any | null;
  loading: boolean;
  error: string | null;
}

export const useAuthenticatedStudent = (): AuthenticatedStudentData => {
  const [authenticatedStudentId, setAuthenticatedStudentId] = useState<string | null>(null);
  const [studentRecord, setStudentRecord] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAuthenticatedStudent = async () => {
      try {
        console.log('🔍 Fetching authenticated user...');
        const userResponse = await api.get('/api/dj-rest-auth/user/');
        
        const authUserId = userResponse.pk?.toString() || userResponse.id?.toString();
        
        if (!authUserId) {
          throw new Error('No user ID found in authentication response');
        }
        
        console.log('✅ Authenticated User ID:', authUserId);

        const studentsResponse = await api.get(`/api/students/students/?user=${authUserId}`);
        console.log('📦 Students API Response:', studentsResponse);
        console.log('📦 Response type:', typeof studentsResponse);
        console.log('📦 Is array?:', Array.isArray(studentsResponse));
        console.log('📦 Has results?:', studentsResponse?.results);

        let students = [];
        if (Array.isArray(studentsResponse)) {
          students = studentsResponse;
        } else if (studentsResponse && studentsResponse.results && Array.isArray(studentsResponse.results)) {
          students = studentsResponse.results;
        } else if (studentsResponse && typeof studentsResponse === 'object' && studentsResponse.id) {
          // Single student object returned
          students = [studentsResponse];
        }

        console.log('📊 Parsed students array:', students);
        console.log('📊 Students length:', students.length);

        if (students.length > 0) {
          const studentRecord = students[0];
          const realStudentId = studentRecord.id?.toString() || studentRecord.pk?.toString();

          if (!realStudentId) {
            console.error('❌ Student record missing ID:', studentRecord);
            throw new Error(`Student record found but missing ID for user ${authUserId}`);
          }

          console.log('✅ Found student record:', {
            userId: authUserId,
            studentId: realStudentId,
            studentName: studentRecord.full_name || studentRecord.user?.first_name || 'Unknown'
          });

          setAuthenticatedStudentId(realStudentId);
          setStudentRecord(studentRecord);
        } else {
          console.error('❌ No students found. Response was:', studentsResponse);
          throw new Error(`No student record found for user ID: ${authUserId}. Please contact your administrator.`);
        }
      } catch (err: any) {
        console.error('❌ Error fetching authenticated student:', err);
        setError(err.message || 'Failed to fetch authenticated student');
      } finally {
        setLoading(false);
      }
    };

    fetchAuthenticatedStudent();
  }, []);

  return { authenticatedStudentId, studentRecord, loading, error };
};