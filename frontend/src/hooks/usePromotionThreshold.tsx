import { useState, useEffect } from "react";
import api from "@/services/api"; // adjust path
import {
  PromotionRule,
  ClassItem,
  UsePromotionThresholdReturn,
} from "@/types/student_promotions";


const FALLBACK_THRESHOLD = 49;

// Cache within the session so we don't re-fetch for the same level
const _cache: Record<string | number, number> = {};

export function usePromotionThreshold(
    classId?: string | number | null, classes: ClassItem[] = []
): UsePromotionThresholdReturn {
 const [threshold, setThreshold] = useState<number>(FALLBACK_THRESHOLD);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    if (!classId || !classes.length) {
      setThreshold(FALLBACK_THRESHOLD);
      return;
    }

    // Derive education_level_id from the class list
    const cls = classes.find((c) => String(c.id) === String(classId));
    const levelId = cls?.education_level ?? cls?.education_level_id;

    if (!levelId) {
      setThreshold(FALLBACK_THRESHOLD);
      return;
    }

    // Return cached value instantly if available
    if (_cache[levelId] !== undefined) {
      setThreshold(_cache[levelId]);
      return;
    }

    setLoading(true);

    api
      .get("/api/student_promotions/rules/", { params: { education_level: levelId } })
      .then((res) => {
        const rules: PromotionRule[] = Array.isArray(res.data)
          ? res.data
          : res.data.results ?? [];

        const rule = rules.find(
          (r) =>
            String(r.education_level_detail?.id ?? r.education_level) ===
            String(levelId)
        );

        const t = rule
          ? parseFloat(rule.pass_threshold)
          : FALLBACK_THRESHOLD;
        _cache[levelId] = t;
        setThreshold(t);
      })
      .catch(() => setThreshold(FALLBACK_THRESHOLD))
      .finally(() => setLoading(false));
  }, [classId, classes]);

  return { threshold, loading };
}