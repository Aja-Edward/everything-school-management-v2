// services/ProfessionalAssignmentService.ts
import api from './api';
import type {
  AssignedStudentsResponse,
  UpdateTeacherRemarkRequest,
  UpdateTeacherRemarkResponse,
  SignatureUploadResponse,
  ApplySignatureRequest,
  ApplySignatureResponse,
  RemarkTemplatesResponse,
  StudentFilters,
  UpdateHeadTeacherRemarkRequest,
  UpdateHeadTeacherRemarkResponse,
  PendingReviewsResponse,
} from '@/types/results';

export const API_BASE_URL =
  import.meta.env.VITE_API_URL ||
  'https://school-project-with-edward.onrender.com/api';

class ProfessionalAssignmentService {
  private baseUrl = '/api/results/professional-assignment';
  private headTeacherUrl = '/api/results/head-teacher-assignment';

  /**
   * Get all students assigned to the current teacher
   */
  async getAssignedStudents(filters?: StudentFilters): Promise<AssignedStudentsResponse> {
    try {
      const data = await api.get(`${this.baseUrl}/my-students/`, {
        params: filters,
      });
      return data;
    } catch (error: any) {
      console.error('Error fetching assigned students:', error.response?.data || error);
      throw error;
    }
  }

  /**
   * Update teacher remark for a student's term report
   */
  async updateTeacherRemark(
    data: UpdateTeacherRemarkRequest
  ): Promise<UpdateTeacherRemarkResponse> {
    try {
      const token = localStorage.getItem('authToken') || sessionStorage.getItem('authToken');
      const headers: Record<string, string> = {};
      
      if (token) {
        const isJWT = token.split('.').length === 3;
        headers['Authorization'] = isJWT ? `Bearer ${token}` : `Token ${token}`;
      }
      
      // Convert JSON to FormData
      const formData = new FormData();
      Object.entries(data).forEach(([key, value]) => {
        if (value !== null && value !== undefined) {
          formData.append(key, value.toString());
        }
      });
      
      // ✅ FIXED: Remove duplicate /api
      const url = `https://school-project-with-edward.onrender.com${this.baseUrl}/update-remark/`;
      console.log('🌐 POST request to:', url);
      console.log('📤 Request data:', data);
      console.log('📋 Request headers:', headers);
      
      const response = await fetch(url, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: formData,
      });
      
      console.log('📊 Response status:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Error response:', errorText);
        
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: errorText };
        }
        
        throw new Error(errorData.error || errorData.detail || `HTTP ${response.status}`);
      }
      
      return await response.json();
    } catch (error: any) {
      console.error('Error updating teacher remark:', error);
      throw error;
    }
  }

  /**
   * Upload teacher signature to Cloudinary
   */
  async uploadTeacherSignature(signatureFile: File): Promise<SignatureUploadResponse> {
    try {
      const formData = new FormData();
      formData.append('signature_image', signatureFile);
      
      const token = localStorage.getItem('authToken') || sessionStorage.getItem('authToken');
      const headers: Record<string, string> = {};
      
      if (token) {
        const isJWT = token.split('.').length === 3;
        headers['Authorization'] = isJWT ? `Bearer ${token}` : `Token ${token}`;
      }
      
      const response = await fetch(
        `${API_BASE_URL}${this.baseUrl}/upload-signature/`,
        {
          method: 'POST',
          headers,
          body: formData,
          credentials: 'include',
        }
      );
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Upload failed');
      }
      
      return await response.json();
    } catch (error: any) {
      console.error('Error uploading signature:', error);
      throw error;
    }
  }

  /**
   * Apply uploaded signature to multiple term reports
   */
 async applySignatureToReports(
  data: ApplySignatureRequest
): Promise<ApplySignatureResponse> {
  try {
    const token = localStorage.getItem('authToken') || sessionStorage.getItem('authToken');
    const headers: Record<string, string> = {};
    
    if (token) {
      const isJWT = token.split('.').length === 3;
      headers['Authorization'] = isJWT ? `Bearer ${token}` : `Token ${token}`;
    }
    
    const formData = new FormData();
    
    // Add fields
    formData.append('signature_url', data.signature_url);
    formData.append('education_level', data.education_level);
    
    // Send array as JSON string within FormData
    formData.append('term_report_ids', JSON.stringify(data.term_report_ids));
    
    const url = `https://school-project-with-edward.onrender.com${this.baseUrl}/apply-signature/`;
    console.log('🌐 POST request to:', url);
    console.log('📤 Request data:', data);
    
    // Debug: Log FormData contents
    console.log('📋 FormData contents:');
    for (let pair of formData.entries()) {
      console.log(pair[0] + ': ' + pair[1]);
    }
    
    const response = await fetch(url, {
      method: 'POST',
      headers,
      credentials: 'include',
      body: formData,
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Error response:', errorText);
      
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { error: errorText };
      }
      
      throw new Error(errorData.error || errorData.detail || `HTTP ${response.status}`);
    }
    
    return await response.json();
  } catch (error: any) {
    console.error('Error applying signature:', error);
    throw error;
  }
}

  /**
   * Get remark templates for quick insertion
   */
  async getRemarkTemplates(): Promise<RemarkTemplatesResponse> {
    try {
      const data = await api.get(`${this.baseUrl}/remark-templates/`);
      return data;
    } catch (error: any) {
      console.error('Error fetching remark templates:', error.response?.data || error);
      throw error;
    }
  }

  // ===== HEAD TEACHER METHODS =====

  /**
   * Get all pending reviews for head teacher
   */
  async getPendingReviews(examSessionId?: string): Promise<PendingReviewsResponse> {
    try {
      const data = await api.get(`${this.headTeacherUrl}/pending-reviews/`, {
        params: { exam_session: examSessionId },
      });
      return data;
    } catch (error: any) {
      console.error('Error fetching pending reviews:', error.response?.data || error);
      throw error;
    }
  }

  /**
   * Update head teacher remark
   */
  async updateHeadTeacherRemark(
    data: UpdateHeadTeacherRemarkRequest
  ): Promise<UpdateHeadTeacherRemarkResponse> {
    try {
      const token = localStorage.getItem('authToken') || sessionStorage.getItem('authToken');
      const headers: Record<string, string> = {};

      if (token) {
        const isJWT = token.split('.').length === 3;
        headers['Authorization'] = isJWT ? `Bearer ${token}` : `Token ${token}`;
      }
      
      const formData = new FormData();
      Object.entries(data).forEach(([key, value]) => {
        if (value !== null && value !== undefined) {
          formData.append(key, value.toString());
        }
      });
      
      // ✅ FIXED: Remove duplicate /api
      const url = `https://school-project-with-edward.onrender.com${this.headTeacherUrl}/update-head-remark/`;
      console.log('🌐 POST request to:', url);
      console.log('📤 Request data:', data);
      
      const response = await fetch(url, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: formData,
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Error response:', errorText);
        
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: errorText };
        }
        
        throw new Error(errorData.error || errorData.detail || `HTTP ${response.status}`);
      }
      
      return await response.json();
    } catch (error: any) {
      console.error('Error updating head teacher remark:', error);
      throw error;
    }
  }

  /**
   * Upload head teacher signature
   */
  async uploadHeadTeacherSignature(signatureFile: File): Promise<SignatureUploadResponse> {
    try {
      const formData = new FormData();
      formData.append('signature_image', signatureFile);
      
      const token = localStorage.getItem('authToken') || sessionStorage.getItem('authToken');
      const headers: Record<string, string> = {};
      
      if (token) {
        const isJWT = token.split('.').length === 3;
        headers['Authorization'] = isJWT ? `Bearer ${token}` : `Token ${token}`;
      }
      
      const response = await fetch(
        `${API_BASE_URL}${this.headTeacherUrl}/upload-head-signature/`,
        {
          method: 'POST',
          headers,
          body: formData,
          credentials: 'include',
        }
      );
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Upload failed');
      }
      
      return await response.json();
    } catch (error: any) {
      console.error('Error uploading head signature:', error);
      throw error;
    }
  }

  /**
   * Apply head teacher signature to reports
   */
  async applyHeadSignature(
    data: ApplySignatureRequest
  ): Promise<ApplySignatureResponse> {
    try {
      const token = localStorage.getItem('authToken') || sessionStorage.getItem('authToken');
      const headers: Record<string, string> = {};
      
      if (token) {
        const isJWT = token.split('.').length === 3;
        headers['Authorization'] = isJWT ? `Bearer ${token}` : `Token ${token}`;
      }
      
      // Convert to FormData instead of JSON
      const formData = new FormData();
      Object.entries(data).forEach(([key, value]) => {
        if (value !== null && value !== undefined) {
          if (Array.isArray(value)) {
            formData.append(key, JSON.stringify(value));
          } else {
            formData.append(key, value.toString());
          }
        }
      });
      
      // ✅ FIXED: Remove duplicate /api
      const url = `https://school-project-with-edward.onrender.com${this.headTeacherUrl}/apply-head-signature/`;
      console.log('🌐 POST request to:', url);
      console.log('📤 Request data:', data);
      
      const response = await fetch(url, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: formData,
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Error response:', errorText);
        
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: errorText };
        }
        
        throw new Error(errorData.error || errorData.detail || `HTTP ${response.status}`);
      }
      
      return await response.json();
    } catch (error: any) {
      console.error('Error applying head signature:', error);
      throw error;
    }
  }
}

export default new ProfessionalAssignmentService(); 