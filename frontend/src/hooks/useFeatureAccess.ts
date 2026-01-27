/**
 * ============================================================================
 * useFeatureAccess.ts
 * Hook for checking feature access and managing feature-based permissions
 * ============================================================================
 */

import { useState, useEffect, useCallback } from 'react';
import { checkFeatureAccess } from '@/services/BillingService';
import type { FeatureAccess } from '@/types/types';

// ============================================================================
// TYPES
// ============================================================================

interface UseFeatureAccessOptions {
  featureId: string;
  academicSessionId?: string;
  termId?: string;
  enabled?: boolean;  // Whether to automatically check access
}

interface UseFeatureAccessReturn extends FeatureAccess {
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

// ============================================================================
// HOOK
// ============================================================================

/**
 * Hook to check if a feature is accessible for the current tenant
 *
 * @example
 * ```tsx
 * const { hasAccess, loading, error } = useFeatureAccess({
 *   featureId: 'exams',
 *   academicSessionId: currentSession.id,
 *   termId: currentTerm.id,
 * });
 *
 * if (loading) return <Loading />;
 * if (!hasAccess) return <UpgradePrompt feature="exams" />;
 * return <ExamContent />;
 * ```
 */
export const useFeatureAccess = (options: UseFeatureAccessOptions): UseFeatureAccessReturn => {
  const {
    featureId,
    academicSessionId,
    termId,
    enabled = true,
  } = options;

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const [featureAccess, setFeatureAccess] = useState<FeatureAccess>({
    has_access: false,
    feature_id: featureId,
    feature_name: '',
    loading: true,
  });

  const checkAccess = useCallback(async () => {
    // Don't check if disabled or missing required params
    if (!enabled || !featureId || !academicSessionId || !termId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await checkFeatureAccess(featureId, academicSessionId, termId);
      setFeatureAccess({
        ...result,
        loading: false,
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to check feature access');
      setError(error);
      console.error('Feature access check failed:', error);

      // Set default access denied on error
      setFeatureAccess({
        has_access: false,
        feature_id: featureId,
        feature_name: featureId,
        loading: false,
      });
    } finally {
      setLoading(false);
    }
  }, [enabled, featureId, academicSessionId, termId]);

  useEffect(() => {
    checkAccess();
  }, [checkAccess]);

  return {
    ...featureAccess,
    loading,
    error,
    refetch: checkAccess,
  };
};

/**
 * Hook to check multiple feature access at once
 *
 * @example
 * ```tsx
 * const features = useMultipleFeatureAccess({
 *   featureIds: ['exams', 'attendance', 'messaging'],
 *   academicSessionId: currentSession.id,
 *   termId: currentTerm.id,
 * });
 *
 * if (features.loading) return <Loading />;
 *
 * const accessibleFeatures = features.results.filter(f => f.has_access);
 * ```
 */
export const useMultipleFeatureAccess = (options: {
  featureIds: string[];
  academicSessionId?: string;
  termId?: string;
  enabled?: boolean;
}): {
  results: FeatureAccess[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
} => {
  const {
    featureIds,
    academicSessionId,
    termId,
    enabled = true,
  } = options;

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const [results, setResults] = useState<FeatureAccess[]>([]);

  const checkAllAccess = useCallback(async () => {
    if (!enabled || featureIds.length === 0 || !academicSessionId || !termId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const accessChecks = await Promise.all(
        featureIds.map((featureId) =>
          checkFeatureAccess(featureId, academicSessionId, termId)
        )
      );

      setResults(accessChecks);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to check feature access');
      setError(error);
      console.error('Multiple feature access check failed:', error);

      // Set default access denied for all on error
      setResults(
        featureIds.map((featureId) => ({
          has_access: false,
          feature_id: featureId,
          feature_name: featureId,
        }))
      );
    } finally {
      setLoading(false);
    }
  }, [enabled, featureIds, academicSessionId, termId]);

  useEffect(() => {
    checkAllAccess();
  }, [checkAllAccess]);

  return {
    results,
    loading,
    error,
    refetch: checkAllAccess,
  };
};

export default useFeatureAccess;
