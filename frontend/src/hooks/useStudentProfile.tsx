import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './useAuth';
import api from '@/services/api';

interface StudentProfile {
  id: string;
  full_name: string;
  short_name: string;
  email: string;
  gender: string;
  date_of_birth: string;
  age: number;
  education_level: string;
  education_level_display: string;
  student_class: string;
  student_class_display: string;
  is_nursery_student: boolean;
  is_primary_student: boolean;
  is_secondary_student: boolean;
  is_active: boolean;
  admission_date: string;
  parent_contact: string;
  emergency_contact: string;
  emergency_contacts: Array<{
    type: string;
    number: string;
    is_primary: boolean;
  }>;
  medical_conditions: string;
  special_requirements: string;
  parents: Array<{
    id: string;
    full_name: string;
    email: string;
    phone: string;
    relationship: string;
    is_primary_contact: boolean;
  }>;
  profile_picture: string;
  classroom: string;
  section_id: string;
  user_info: {
    username: string;
    email: string;
    first_name: string;
    last_name: string;
    middle_name: string;
    is_active: boolean;
    date_joined: string;
  };
  academic_info: {
    class: string;
    education_level: string;
    admission_date: string;
    registration_number: string;
    classroom: string;
  };
  contact_info: {
    parent_contact: string;
    emergency_contact: string;
  };
  medical_info: {
    medical_conditions: string;
    special_requirements: string;
  };
}

interface UseStudentProfileReturn {
  profile: StudentProfile | null;
  loading: boolean;
  error: string | null;
  refreshProfile: () => Promise<void>;
  updateProfile: (data: Partial<StudentProfile>) => Promise<void>;
}

export const useStudentProfile = (): UseStudentProfileReturn => {
  const { user, isAuthenticated } = useAuth();
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProfile = useCallback(async () => {
    if (!isAuthenticated || !user) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // ✅ Routes through api.ts — CSRF + credentials handled automatically
      const data: StudentProfile = await api.get('/students/students/profile/');
      setProfile(data);
    } catch (err: any) {
      const message = err?.response?.data?.detail ?? err?.message ?? 'Failed to fetch profile';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, user]);

  const refreshProfile = useCallback(async () => {
    await fetchProfile();
  }, [fetchProfile]);

  const updateProfile = useCallback(
    async (data: Partial<StudentProfile>) => {
      if (!profile) return;

      setError(null);
      try {
        // ✅ api.patch handles CSRF token automatically for mutating requests
        const updated: StudentProfile = await api.patch(
          `/students/students/${profile.id}/`,
          data
        );
        setProfile(updated);
      } catch (err: any) {
        const message = err?.response?.data?.detail ?? err?.message ?? 'Failed to update profile';
        setError(message);
        throw err; // Re-throw so callers can handle it
      }
    },
    [profile]
  );

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  return {
    profile,
    loading,
    error,
    refreshProfile,
    updateProfile,
  };
};