import { useState, useEffect, useCallback, useMemo } from "react";
import api from "@/services/api";
import {
  PromotionRule,
  PromotionRuleRow,
  PromotionFilter,
  PromotionSummary,
  EducationLevel,
  ClassItem,
  AcademicSession,
  StudentPromotion,
  AutoPromotionPayload,
  AutoPromotionResult,
  ManualOverridePayload,
  ManualOverrideResult,
  UsePromotionThresholdReturn,
  UsePromotionRulesReturn,
  UseAutoPromotionReturn,
  UseManualOverrideReturn,
  UsePromotionDashboardReturn,
} from "@/types/student_promotions";
import { useThresholdCache } from "@/contexts/PromotionThresholdContext";

// ─── Constants ────────────────────────────────────────────────────────────────

const FALLBACK_THRESHOLD = 49;
const MANAGED_LEVEL_TYPES = ["NURSERY", "PRIMARY", "JUNIOR_SECONDARY", "SENIOR_SECONDARY"] as const;

// ─── usePromotionThreshold ────────────────────────────────────────────────────

export function usePromotionThreshold(
  classId?: string | number | null,
  classes: ClassItem[] = []
): UsePromotionThresholdReturn {
  const { cache, setCache, version } = useThresholdCache();
  const [threshold, setThreshold] = useState<number>(FALLBACK_THRESHOLD);
  const [loading, setLoading] = useState<boolean>(false);

  // Derive levelId outside the effect so we can use it as a stable primitive dep
  const levelId = (() => {
    if (!classId || !classes.length) return null;
    const cls = classes.find((c) => String(c.id) === String(classId));
    const raw = cls?.education_level ?? cls?.education_level_id ?? null;
    // Unwrap nested object e.g. { id: 3, name: "Primary" } → 3
    if (raw && typeof raw === "object" && "id" in raw) return raw.id;
    return raw;
  })();

  useEffect(() => {
    if (!levelId) {
      setThreshold(FALLBACK_THRESHOLD);
      return;
    }

    // Cache hit — use stored value (cache is cleared when version bumps)
    if (cache[levelId] !== undefined) {
      setThreshold(cache[levelId]);
      return;
    }

    // Cache miss — fetch from API
    setLoading(true);
    api.get("/api/student_promotions/rules/", { education_level: levelId, _v: version })
      .then((res) => {
        const raw = (res?.data ?? res) as { results?: PromotionRule[] } | PromotionRule[];
        const rules: PromotionRule[] = Array.isArray(raw) ? raw : raw.results ?? [];

        const rule = rules.find((r) => {
        const detail = r.education_level_detail as any;
        const byCode =
          String(detail?.code ?? "").toLowerCase() === String(levelId).toLowerCase() ||
          String(detail?.level_type ?? "").toLowerCase().replace(/-/g, "_") ===
            String(levelId).toLowerCase().replace(/-/g, "_");
        const byId = String(detail?.id ?? r.education_level) === String(levelId);
        return byCode || byId;
      });

      const t = rule ? parseFloat(rule.pass_threshold) : FALLBACK_THRESHOLD;
      setCache(levelId, t);
      setThreshold(t);
    })
      .catch(() => setThreshold(FALLBACK_THRESHOLD))
      .finally(() => setLoading(false));

  }, [levelId, version]); // ← stable primitives only, no array refs

  return { threshold, loading };
}

// ─── usePromotionRules ────────────────────────────────────────────────────────

export function usePromotionRules(): UsePromotionRulesReturn {
  const { clearCache } = useThresholdCache();
  const [rows, setRows] = useState<PromotionRuleRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [levelsRes, rulesRes] = await Promise.all([
          api.get("/api/academics/education-levels/"),
          api.get("/api/student_promotions/rules/"),
        ]);

        const levelsRaw = (levelsRes?.data ?? levelsRes) as
          | { results?: EducationLevel[] }
          | EducationLevel[];
        const levels: EducationLevel[] = Array.isArray(levelsRaw)
          ? levelsRaw
          : levelsRaw.results ?? [];

        const rulesRaw = (rulesRes?.data ?? rulesRes) as
          | { results?: PromotionRule[] }
          | PromotionRule[];
        const rules: PromotionRule[] = Array.isArray(rulesRaw)
          ? rulesRaw
          : rulesRaw.results ?? [];

        const ruleByLevel: Record<string | number, PromotionRule> = {};
        for (const rule of rules) {
          const id = rule.education_level_detail?.id ?? rule.education_level;
          ruleByLevel[id] = rule;
        }

        const initialRows: PromotionRuleRow[] = levels
          .filter((l) => {
            const type = (l.level_type ?? (l as any).code ?? "").toUpperCase().replace(/-/g, "_");
            return (MANAGED_LEVEL_TYPES as readonly string[]).includes(type);
          })
          .map((level) => {
            const type = (level.level_type ?? (level as any).code ?? "").toUpperCase().replace(/-/g, "_");
            const existing = ruleByLevel[level.id];
            return {
              education_level_id: level.id,
              education_level_name: level.name,
              level_type: type,
              rule_id: existing?.id ?? null,
              pass_threshold: existing ? parseFloat(existing.pass_threshold) : FALLBACK_THRESHOLD,
              require_all_three_terms: existing?.require_all_three_terms ?? true,
              dirty: false,
            };
          });

        setRows(initialRows);
      } catch (err) {
        console.error("Load failed:", err);
        setError("Failed to load promotion settings.");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const updateRow = useCallback(
    (levelId: string | number, field: keyof PromotionRuleRow, value: unknown) => {
      setRows((prev) =>
        prev.map((row) =>
          row.education_level_id === levelId
            ? { ...row, [field]: value, dirty: true }
            : row
        )
      );
      setSavedAt(null);
    },
    []
  );

  const saveAll = useCallback(async (): Promise<boolean> => {
    const invalidRow = rows.find((row) => {
      const t = parseFloat(String(row.pass_threshold));
      return isNaN(t) || t < 0 || t > 100;
    });

    if (invalidRow) {
      setError(`Invalid threshold for ${invalidRow.education_level_name}. Must be between 0 and 100.`);
      return false;
    }

    setSaving(true);
    setError(null);

    try {
      const updated = await Promise.all(
        rows.map((row): Promise<PromotionRuleRow> => {
          if (!row.dirty) return Promise.resolve(row);

          const payload = {
            education_level: row.education_level_id,
            pass_threshold: parseFloat(String(row.pass_threshold)).toFixed(2),
            require_all_three_terms: row.require_all_three_terms,
            is_active: true,
          };

          const request = row.rule_id
            ? api.patch(`/api/student_promotions/rules/${row.rule_id}/`, payload)
            : api.post("/api/student_promotions/rules/", payload);

          return request.then((r) => {
            const rule = (r?.data ?? r) as PromotionRule;
            return { ...row, rule_id: rule.id, dirty: false };
          });
        })
      );

      setRows(updated);
      setSavedAt(new Date());
      clearCache(); // bumps version → triggers re-fetch in usePromotionThreshold
      return true;

    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })
        ?.response?.data?.detail;
      setError(detail ?? "Some settings could not be saved. Please check the values and try again.");
      return false;
    } finally {
      setSaving(false);
    }
  }, [rows, clearCache]);

  const hasDirty = rows.some((r) => r.dirty);

  return { rows, loading, saving, error, savedAt, hasDirty, updateRow, saveAll };
}

// ─── useAutoPromotion ─────────────────────────────────────────────────────────

export function useAutoPromotion(): UseAutoPromotionReturn {
  const [running, setRunning] = useState<boolean>(false);
  const [error, setError]     = useState<string | null>(null);
  const [result, setResult]   = useState<AutoPromotionResult | null>(null);

  const run = useCallback(
    async (payload: AutoPromotionPayload): Promise<AutoPromotionResult | null> => {
      setRunning(true);
      setError(null);
      try {
        const res = await api.post("/api/student_promotions/run-auto/", payload);
        const data = (res?.data ?? res) as AutoPromotionResult;
        setResult(data);
        return data;
      } catch (err: unknown) {
        const detail = (err as { response?: { data?: { detail?: string } } })
          ?.response?.data?.detail;
        setError(detail ?? "Auto-promotion failed. Please try again.");
        return null;
      } finally {
        setRunning(false);
      }
    },
    []
  );

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  return { run, running, error, result, reset };
}

// ─── useManualOverride ────────────────────────────────────────────────────────

export function useManualOverride(): UseManualOverrideReturn {
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError]   = useState<string | null>(null);

  const submit = useCallback(
    async (
      promotionId: string,
      payload: ManualOverridePayload
    ): Promise<ManualOverrideResult | null> => {
      setSaving(true);
      setError(null);
      try {
        const res = await api.post(
          `/api/student_promotions/${promotionId}/manual-promote/`,
          payload
        );
        return (res?.data ?? res) as ManualOverrideResult;
      } catch (err: unknown) {
        const detail = (err as { response?: { data?: { detail?: string } } })
          ?.response?.data?.detail;
        setError(detail ?? "Could not save override. Please try again.");
        return null;
      } finally {
        setSaving(false);
      }
    },
    []
  );

  return { submit, saving, error };
}

// ─── usePromotionDashboard ────────────────────────────────────────────────────

export function usePromotionDashboard(): UsePromotionDashboardReturn {
  const [sessions, setSessions] = useState<AcademicSession[]>([]);
  const [classes,  setClasses]  = useState<ClassItem[]>([]);
  const [selectedSession, setSelectedSession] = useState<string>("");
  const [selectedClass,   setSelectedClass]   = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<PromotionFilter>("ALL");
  const [search,       setSearch]       = useState<string>("");
  const [promotions, setPromotions] = useState<StudentPromotion[]>([]);
  const [summary,    setSummary]    = useState<PromotionSummary | null>(null);
  const [loading,    setLoading]    = useState<boolean>(false);
  const [error,      setError]      = useState<string | null>(null);

  useEffect(() => {
    const normalise = <T,>(data: unknown): T[] => {
      if (Array.isArray(data)) return data as T[];
      if (data && typeof data === "object" && "results" in data)
        return (data as { results?: T[] }).results ?? [];
      return [];
    };

    Promise.all([
      api.get("/api/academics/sessions/"),
      api.get("/api/classrooms/classrooms/"),
    ]).then(([sessRes, clsRes]) => {
      setSessions(normalise<AcademicSession>(sessRes?.data ?? sessRes));
      setClasses(normalise<ClassItem>(clsRes?.data ?? clsRes));
    }).catch(() => {});
  }, []);

  const loadPromotions = useCallback(async () => {
    if (!selectedSession || !selectedClass) {
      setPromotions([]);
      setSummary(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [promoRes, summaryRes] = await Promise.all([
        api.get("/api/student_promotions/", { academic_session_id: selectedSession, student_class_id: selectedClass }),
        api.get("/api/student_promotions/summary/", { academic_session_id: selectedSession, student_class_id: selectedClass }),
      ]);

      const raw = promoRes?.data ?? promoRes;
      setPromotions(Array.isArray(raw) ? raw : (raw as any)?.results ?? []);
      setSummary((summaryRes?.data ?? summaryRes) as PromotionSummary);

    } catch {
      setError("Failed to load promotion data");
    } finally {
      setLoading(false);
    }
  }, [selectedSession, selectedClass]);

  useEffect(() => { loadPromotions(); }, [loadPromotions]);

  const refreshSummary = useCallback(async () => {
    if (!selectedSession || !selectedClass) return;
    try {
      const res = await api.get("/api/student_promotions/summary/", { academic_session_id: selectedSession, student_class_id: selectedClass });
      setSummary((res?.data ?? res) as PromotionSummary);
    } catch {}
  }, [selectedSession, selectedClass]);

  const applyAutoRunResult = useCallback((result: AutoPromotionResult) => {
    setPromotions(result.student_promotions ?? []);
    setSummary(result.summary);
  }, []);

  const applyOverrideResult = useCallback((updated: StudentPromotion) => {
    setPromotions((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
  }, []);

  const filteredPromotions = useMemo(() => {
    const q = search.toLowerCase();
    return promotions.filter((p) => {
      if (statusFilter !== "ALL" && p.status !== statusFilter) return false;
      if (!q) return true;
      const name = (p.student_name ?? p.student_detail?.full_name ?? "").toLowerCase();
      const adm  = (p.student_admission_number ?? p.student_detail?.admission_number ?? "").toLowerCase();
      return name.includes(q) || adm.includes(q);
    });
  }, [promotions, statusFilter, search]);

  return {
    sessions, classes,
    selectedSession, selectedClass, setSelectedSession, setSelectedClass,
    statusFilter, setStatusFilter,
    search, setSearch,
    promotions, filteredPromotions, summary,
    loading, error,
    applyAutoRunResult, applyOverrideResult, refreshSummary,
  };
}