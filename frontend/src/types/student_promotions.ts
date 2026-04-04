export interface PromotionRule {
  id: string;
  education_level: string | number;
  education_level_detail?: {
    id: string | number;
    name: string;
  };
  pass_threshold: string; // comes as string from API
  require_all_three_terms: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}


export type PromotionStatus =
  | "PENDING"
  | "PROMOTED"
  | "HELD_BACK"
  | "FLAGGED";

export type PromotionType = "AUTO" | "MANUAL";

export interface StudentPromotion {
  id: string;

  student: string;
  student_detail?: {
    id: string;
    full_name: string;
  };

  academic_session: string;
  academic_session_detail?: {
    id: string;
    name: string;
  };

  student_class?: string | null;

  term1_average?: string | null;
  term2_average?: string | null;
  term3_average?: string | null;

  session_average?: string | null;
  terms_counted: number;

  status: PromotionStatus;
  promotion_type?: PromotionType | null;

  reason?: string;

  processed_by?: string | null;
  processed_at?: string | null;

  pass_threshold_applied?: string | null;

  created_at: string;
  updated_at: string;
}


export interface ClassItem {
  id: string | number;
  name: string;
  education_level?: string | number;
  education_level_id?: string | number;
}


export interface UsePromotionThresholdReturn {
  threshold: number;
  loading: boolean;
}


export interface UsePromotionThresholdParams {
  classId?: string | number | null;
  classes?: ClassItem[];
}