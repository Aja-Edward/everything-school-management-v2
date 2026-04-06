// ─── Shared primitives ────────────────────────────────────────────────────────

export type PromotionStatus = "PENDING" | "PROMOTED" | "HELD_BACK" | "FLAGGED";
export type PromotionFilter = PromotionStatus | "ALL";
export type PromotionType   = "AUTO" | "MANUAL";
export type ManagedLevelType =
  | "PRIMARY"
  | "JUNIOR_SECONDARY"
  | "SENIOR_SECONDARY";

// ─── Education levels ─────────────────────────────────────────────────────────

export interface EducationLevel {
  id: string | number;
  name: string;
  /** Only levels whose type is in ManagedLevelType get promotion rules. */
  level_type: ManagedLevelType | string;
}

// ─── Promotion rules ──────────────────────────────────────────────────────────

export interface PromotionRule {
  id: string;
  education_level: string | number;
  education_level_detail?: Pick<EducationLevel, "id" | "name">;
  /** Comes as a decimal string from the API e.g. "49.00" */
  pass_threshold: string;
  require_all_three_terms: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Flattened, UI-friendly row used by PromotionSettingsPage.
 * Merges EducationLevel + PromotionRule; `dirty` tracks unsaved local edits.
 */
export interface PromotionRuleRow {
  education_level_id: string | number;
  education_level_name: string;
  level_type: string;
  /** null means no rule exists yet — a POST will be issued on save. */
  rule_id: string | null;
  pass_threshold: number;
  require_all_three_terms: boolean;
  dirty: boolean;
}

// ─── Student promotions ───────────────────────────────────────────────────────

/**
 * Core promotion record returned by the API.
 * Flat display fields (student_name, etc.) are included for list/drawer usage
 * alongside the nested _detail objects for full data access.
 */
export interface StudentPromotion {
  id: string;

  // FK ids
  student: string;
  academic_session: string;
  student_class?: string | null;

  // Nested detail objects (populated by the API)
  student_detail?: {
    id: string;
    full_name: string;
    admission_number?: string;
  };
  academic_session_detail?: {
    id: string;
    name: string;
  };
  student_class_detail?: {
    id: string;
    name: string;
  };

  // Flat display fields (serialiser may include these alongside _detail)
  student_name?: string;
  student_admission_number?: string;

  // Averages — decimal strings or null
  term1_average?: string | null;
  term2_average?: string | null;
  term3_average?: string | null;
  session_average?: string | null;
  terms_counted: number;

  // Decision fields
  status: PromotionStatus;
  promotion_type?: PromotionType | null;
  reason?: string;
  pass_threshold_applied?: string | null;

  // Audit
  processed_by?: string | null;
  /** Flat name string the serialiser may include alongside the FK id. */
  processed_by_name?: string;
  processed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PromotionSummary {
  total?: number;
  promoted: number;
  flagged: number;
  held_back?: number;
  pending: number;
  /** Decimal string e.g. "72.30" */
  class_average?: string | null;
}

// ─── Auto-promotion ───────────────────────────────────────────────────────────

export interface AutoPromotionPayload {
  academic_session_id: string | number;
  student_class_id: string | number;
}

export interface AutoPromotionSummary {
  promoted: number;
  flagged: number;
  pending: number;
  held_back?: number;
  /** Decimal string e.g. "72.30" */
  class_average?: string | null;
}

export interface AutoPromotionResult {
  summary: AutoPromotionSummary;
  promotions: StudentPromotion[];
}

// ─── Manual override ──────────────────────────────────────────────────────────

export interface ManualOverridePayload {
  status: Extract<PromotionStatus, "PROMOTED" | "HELD_BACK">;
  reason: string;
}

/** The API echoes back the updated StudentPromotion record. */
export type ManualOverrideResult = StudentPromotion;

// ─── Classes ──────────────────────────────────────────────────────────────────

export interface ClassItem {
  id: string | number;
  name: string;
  /** One of these two fields must be present for threshold lookup. */
  education_level?: string | number;
  education_level_id?: string | number;
}

// ─── Session ──────────────────────────────────────────────────────────────────

export interface AcademicSession {
  id: string | number;
  name: string;
}

// ─── Hook return types ────────────────────────────────────────────────────────

/** usePromotionThreshold — read-only threshold for the selected class. */
export interface UsePromotionThresholdReturn {
  threshold: number;
  loading: boolean;
}

/** usePromotionRules — full CRUD for PromotionSettingsPage. */
export interface UsePromotionRulesReturn {
  rows: PromotionRuleRow[];
  loading: boolean;
  saving: boolean;
  error: string | null;
  savedAt: Date | null;
  hasDirty: boolean;
  updateRow: (
    levelId: string | number,
    field: keyof PromotionRuleRow,
    value: unknown
  ) => void;
  saveAll: () => Promise<boolean>;
}

/** useAutoPromotion — triggers the auto-promotion run for a class + session. */
export interface UseAutoPromotionReturn {
  run: (payload: AutoPromotionPayload) => Promise<AutoPromotionResult | null>;
  running: boolean;
  error: string | null;
  result: AutoPromotionResult | null;
  reset: () => void;
}

/** useManualOverride — submits a manual promote / hold-back decision. */
export interface UseManualOverrideReturn {
  submit: (
    promotionId: string,
    payload: ManualOverridePayload
  ) => Promise<ManualOverrideResult | null>;
  saving: boolean;
  error: string | null;
}

/** Documented parameter shape for usePromotionThreshold. */
export interface UsePromotionThresholdParams {
  classId?: string | number | null;
  classes?: ClassItem[];
}

/** usePromotionDashboard — owns all data for PromotionDashboard. */
export interface UsePromotionDashboardReturn {
  // Reference data
  sessions: AcademicSession[];
  classes: ClassItem[];
 
  // Selection state
  selectedSession: string;
  selectedClass: string;
  setSelectedSession: (id: string) => void;
  setSelectedClass: (id: string) => void;
 
  // Table filter state
  statusFilter: PromotionFilter;
  setStatusFilter: (f: PromotionFilter) => void;
  search: string;
  setSearch: (s: string) => void;
 
  // Data
  promotions: StudentPromotion[];
  filteredPromotions: StudentPromotion[];
  summary: PromotionSummary | null;
  loading: boolean;
  error: string | null;
 
  // Actions
  /** Call after a successful auto-promotion run to merge results in. */
  applyAutoRunResult: (result: AutoPromotionResult) => void;
  /** Call after a manual override is saved to patch the single row. */
  applyOverrideResult: (updated: StudentPromotion) => void;
  /** Re-fetch the summary independently (used after an override). */
  refreshSummary: () => Promise<void>;
}

export interface UsePromotionThresholdParams {
  classId?: string | number | null;
  classes?: ClassItem[];
}
 