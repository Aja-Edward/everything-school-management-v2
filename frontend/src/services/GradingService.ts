// src/services/GradingService.ts
import api from "./api"
import { GradingSystem, Grade } from "@/types/types";

export interface GradingSystemCreateUpdatePayload {
  name: string;
  grading_type: "PERCENTAGE" | "POINTS" | "LETTER" | "PASS_FAIL";
  description?: string;
  min_score?: number;
  max_score?: number;
  pass_mark?: number;
  is_active?: boolean;
  grades?: {
    grade: string;
    min_score: number;
    max_score: number;
    grade_point?: number;
    description?: string;
    is_passing?: boolean;
  }[];
}

class GradingService {
  private endpoint = "/api/results/grading-systems/";

  /**
   * Get all grading systems
   */
  async getAll(): Promise<GradingSystem[]> {
    try {
      console.log('🔍 GradingService.getAll() called');
      // api.get() returns the data directly, not a response object
      const data = await api.get(this.endpoint);
      console.log('📦 API returned:', data);
      console.log('📦 Data type:', typeof data);
      console.log('📦 Is array?:', Array.isArray(data));
      
      // Handle different response structures
      if (Array.isArray(data)) {
        console.log('goodData is array, length:', data.length);
        return data;
      } else if (data?.results && Array.isArray(data.results)) {
        console.log('goodReturning data.results, length:', data.results.length);
        return data.results;
      } else if (data?.data && Array.isArray(data.data)) {
        console.log('goodReturning data.data, length:', data.data.length);
        return data.data;
      } else {
        console.warn('⚠️ Unexpected response structure:', data);
        return [];
      }
    } catch (error) {
      console.error('❌ Error in GradingService.getAll():', error);
      throw error;
    }
  }

  /**
   * Get single grading system by ID
   */
  async getById(id: number): Promise<GradingSystem> {
    const data = await api.get(`${this.endpoint}${id}/`);
    return data;
  }

  /**
   * Create a new grading system
   */
  async create(payload: GradingSystemCreateUpdatePayload): Promise<GradingSystem> {
    const data = await api.post(this.endpoint, payload);
    return data;
  }

  /**
   * Update an existing grading system
   */
  async update(
    id: number,
    payload: GradingSystemCreateUpdatePayload
  ): Promise<GradingSystem> {
    const data = await api.put(`${this.endpoint}${id}/`, payload);
    return data;
  }

  /**
   * Activate a grading system
   */
  async activate(id: number): Promise<GradingSystem> {
    const data = await api.post(`${this.endpoint}${id}/activate/`, {});
    return data;
  }

  /**
   * Deactivate a grading system
   */
  async deactivate(id: number): Promise<GradingSystem> {
    const data = await api.post(`${this.endpoint}${id}/deactivate/`, {});
    return data;
  }
}

export default new GradingService();