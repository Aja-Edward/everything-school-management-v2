import api from './api';

// ── Types ────────────────────────────────────────────────────────────────────

export type ActivityStatus = 'pending' | 'approved' | 'rejected';
export type ApplicableTo = 'all' | 'teaching' | 'non-teaching';

export interface FieldDefinition {
  key: string;
  label: string;
  type: 'text' | 'number' | 'textarea' | 'time' | 'select';
  required?: boolean;
  options?: string[];
}

export interface StaffActivityCategory {
  id: number;
  name: string;
  code: string;
  icon: string;
  applicable_to: ApplicableTo;
  applicable_to_display: string;
  description: string;
  fields_config: FieldDefinition[];
  display_order: number;
  is_active: boolean;
  is_system_default: boolean;
  log_count: number;
  created_at: string;
}

export interface StaffActivityLog {
  id: number;
  teacher: number;
  staff_name: string;
  staff_employee_id: string;
  staff_type: string;
  category: number;
  category_name: string;
  category_icon: string;
  category_fields_config: FieldDefinition[];
  activity_date: string;
  start_time: string | null;
  end_time: string | null;
  duration_minutes: number | null;
  title: string;
  description: string;
  details: Record<string, string | number>;
  attachment_url: string | null;
  status: ActivityStatus;
  status_display: string;
  admin_note: string;
  reviewed_by: number | null;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ActivitySummary {
  total: number;
  by_status: { pending: number; approved: number; rejected: number };
  by_category: Array<{ category__name: string; category__icon: string; count: number }>;
  by_staff: Array<{
    teacher__user__first_name: string;
    teacher__user__last_name: string;
    teacher__employee_id: string;
    teacher__staff_type: string;
    count: number;
  }>;
}

export interface CreateActivityLogPayload {
  category: number;
  activity_date: string;
  start_time?: string;
  end_time?: string;
  title: string;
  description?: string;
  details?: Record<string, string | number>;
  attachment_url?: string;
}

// ── Service ──────────────────────────────────────────────────────────────────

const BASE = '/api/teachers';

const StaffActivitiesService = {
  // ── Categories ──────────────────────────────────────────────────────────

  getCategories(params?: { applicable_to?: ApplicableTo; is_active?: boolean }) {
    return api.get(`${BASE}/activity-categories/`, params as any) as Promise<StaffActivityCategory[]>;
  },

  getCategory(id: number) {
    return api.get(`${BASE}/activity-categories/${id}/`) as Promise<StaffActivityCategory>;
  },

  createCategory(data: Partial<StaffActivityCategory>) {
    return api.post(`${BASE}/activity-categories/`, data) as Promise<StaffActivityCategory>;
  },

  updateCategory(id: number, data: Partial<StaffActivityCategory>) {
    return api.patch(`${BASE}/activity-categories/${id}/`, data) as Promise<StaffActivityCategory>;
  },

  deleteCategory(id: number) {
    return api.delete(`${BASE}/activity-categories/${id}/`);
  },

  seedDefaultCategories() {
    return api.post(`${BASE}/activity-categories/seed-defaults/`, {}) as Promise<{
      seeded: number; message: string;
    }>;
  },

  // ── Logs ────────────────────────────────────────────────────────────────

  getLogs(params?: {
    status?: ActivityStatus;
    category?: number;
    activity_date?: string;
    search?: string;
    ordering?: string;
    page?: number;
    page_size?: number;
  }) {
    return api.get(`${BASE}/activity-logs/`, params as any) as Promise<StaffActivityLog[]>;
  },

  getLog(id: number) {
    return api.get(`${BASE}/activity-logs/${id}/`) as Promise<StaffActivityLog>;
  },

  createLog(data: CreateActivityLogPayload) {
    return api.post(`${BASE}/activity-logs/`, data) as Promise<StaffActivityLog>;
  },

  updateLog(id: number, data: Partial<CreateActivityLogPayload>) {
    return api.patch(`${BASE}/activity-logs/${id}/`, data) as Promise<StaffActivityLog>;
  },

  deleteLog(id: number) {
    return api.delete(`${BASE}/activity-logs/${id}/`);
  },

  reviewLog(id: number, action: 'approve' | 'reject', admin_note?: string) {
    return api.post(`${BASE}/activity-logs/${id}/review/`, { action, admin_note }) as Promise<StaffActivityLog>;
  },

  getSummary() {
    return api.get(`${BASE}/activity-logs/summary/`) as Promise<ActivitySummary>;
  },
};

export default StaffActivitiesService;
