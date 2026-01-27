/**
 * ============================================================================
 * FeatureGate.tsx
 * Component for controlling feature access based on billing status
 * ============================================================================
 */

import React from 'react';
import { useFeatureAccess } from '@/hooks/useFeatureAccess';
import { UpgradePrompt } from './UpgradePrompt';
import { Card } from '@/components/ui/card';

// ============================================================================
// TYPES
// ============================================================================

interface FeatureGateProps {
  featureId: string;
  academicSessionId?: string;
  termId?: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
  loadingFallback?: React.ReactNode;
  showUpgradePrompt?: boolean;
}

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * FeatureGate component for controlling access to paid features
 *
 * @example
 * ```tsx
 * <FeatureGate
 *   featureId="exams"
 *   academicSessionId={currentSession.id}
 *   termId={currentTerm.id}
 * >
 *   <ExamManagementPanel />
 * </FeatureGate>
 * ```
 */
export const FeatureGate: React.FC<FeatureGateProps> = ({
  featureId,
  academicSessionId,
  termId,
  children,
  fallback,
  loadingFallback,
  showUpgradePrompt = true,
}) => {
  const { hasAccess, loading, error, feature_name } = useFeatureAccess({
    featureId,
    academicSessionId,
    termId,
    enabled: !!(academicSessionId && termId),
  });

  // Loading state
  if (loading) {
    if (loadingFallback) {
      return <>{loadingFallback}</>;
    }

    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <Card className="p-6">
        <div className="text-center text-red-600">
          <p className="font-semibold">Error checking feature access</p>
          <p className="text-sm mt-2">{error.message}</p>
        </div>
      </Card>
    );
  }

  // Access granted
  if (hasAccess) {
    return <>{children}</>;
  }

  // Access denied
  if (showUpgradePrompt) {
    return (
      <UpgradePrompt
        featureId={featureId}
        featureName={feature_name || featureId}
        academicSessionId={academicSessionId}
        termId={termId}
      />
    );
  }

  return fallback ? <>{fallback}</> : null;
};

/**
 * HOC version of FeatureGate for wrapping components
 *
 * @example
 * ```tsx
 * const ProtectedExamPage = withFeatureGate(ExamPage, {
 *   featureId: 'exams',
 *   getAcademicSessionId: (props) => props.sessionId,
 *   getTermId: (props) => props.termId,
 * });
 * ```
 */
export const withFeatureGate = <P extends object>(
  Component: React.ComponentType<P>,
  options: {
    featureId: string;
    getAcademicSessionId?: (props: P) => string | undefined;
    getTermId?: (props: P) => string | undefined;
  }
) => {
  return (props: P) => {
    const academicSessionId = options.getAcademicSessionId?.(props);
    const termId = options.getTermId?.(props);

    return (
      <FeatureGate
        featureId={options.featureId}
        academicSessionId={academicSessionId}
        termId={termId}
      >
        <Component {...props} />
      </FeatureGate>
    );
  };
};

export default FeatureGate;
