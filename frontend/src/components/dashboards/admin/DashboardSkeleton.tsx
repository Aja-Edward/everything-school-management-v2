import React from 'react';

/**
 * Dashboard Skeleton Loader
 *
 * Displays a content-shaped skeleton that matches the dashboard layout
 * for better perceived performance during loading.
 */

const SkeletonPulse: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`bg-gray-200 animate-pulse rounded ${className}`} />
);

const StatCardSkeleton: React.FC = () => (
  <div className="bg-white rounded-xl border border-gray-200 p-5">
    <div className="flex items-start justify-between mb-4">
      <SkeletonPulse className="w-10 h-10 rounded-lg" />
      <SkeletonPulse className="w-12 h-4" />
    </div>
    <SkeletonPulse className="w-16 h-8 mb-2" />
    <SkeletonPulse className="w-24 h-4" />
    <div className="mt-3 pt-3 border-t border-gray-100">
      <SkeletonPulse className="w-20 h-3" />
    </div>
  </div>
);

const ChartSkeleton: React.FC<{ height?: number }> = ({ height = 220 }) => (
  <div className="bg-white rounded-xl border border-gray-200 p-5">
    <div className="flex items-center justify-between mb-6">
      <div>
        <SkeletonPulse className="w-32 h-4 mb-2" />
        <SkeletonPulse className="w-24 h-3" />
      </div>
      <SkeletonPulse className="w-8 h-8 rounded-lg" />
    </div>
    <SkeletonPulse className={`w-full rounded-lg`} style={{ height }} />
    <div className="flex items-center justify-center gap-6 mt-4">
      <div className="flex items-center gap-2">
        <SkeletonPulse className="w-3 h-3 rounded" />
        <SkeletonPulse className="w-12 h-3" />
      </div>
      <div className="flex items-center gap-2">
        <SkeletonPulse className="w-3 h-3 rounded" />
        <SkeletonPulse className="w-12 h-3" />
      </div>
    </div>
  </div>
);

const PieChartSkeleton: React.FC = () => (
  <div className="bg-white rounded-xl border border-gray-200 p-5">
    <div className="flex items-center justify-between mb-6">
      <div>
        <SkeletonPulse className="w-28 h-4 mb-2" />
        <SkeletonPulse className="w-20 h-3" />
      </div>
      <SkeletonPulse className="w-8 h-8 rounded-lg" />
    </div>
    <div className="flex justify-center mb-4">
      <SkeletonPulse className="w-32 h-32 rounded-full" />
    </div>
    <div className="grid grid-cols-2 gap-2">
      {[1, 2, 3, 4].map(i => (
        <div key={i} className="flex items-center gap-2">
          <SkeletonPulse className="w-2 h-2 rounded-full" />
          <SkeletonPulse className="w-16 h-3" />
        </div>
      ))}
    </div>
  </div>
);

const QuickActionsSkeleton: React.FC = () => (
  <div className="bg-white rounded-xl border border-gray-200 p-5">
    <SkeletonPulse className="w-24 h-4 mb-4" />
    <div className="space-y-2">
      {[1, 2, 3, 4].map(i => (
        <div key={i} className="flex items-center justify-between p-3 rounded-lg border border-gray-100">
          <div className="flex items-center gap-3">
            <SkeletonPulse className="w-8 h-8 rounded-lg" />
            <SkeletonPulse className="w-28 h-4" />
          </div>
          <SkeletonPulse className="w-4 h-4" />
        </div>
      ))}
    </div>
  </div>
);

const ActivitySkeleton: React.FC = () => (
  <div className="bg-white rounded-xl border border-gray-200 p-5">
    <div className="flex items-center justify-between mb-5">
      <SkeletonPulse className="w-24 h-4" />
      <SkeletonPulse className="w-16 h-4" />
    </div>
    <div className="space-y-4">
      {[1, 2, 3, 4].map(i => (
        <div key={i} className="flex items-start gap-3">
          <SkeletonPulse className="w-8 h-8 rounded-lg flex-shrink-0" />
          <div className="flex-1">
            <SkeletonPulse className="w-full h-4 mb-2" />
            <SkeletonPulse className="w-24 h-3" />
          </div>
          <SkeletonPulse className="w-16 h-3" />
        </div>
      ))}
    </div>
  </div>
);

const EventsSkeleton: React.FC = () => (
  <div className="bg-white rounded-xl border border-gray-200 p-5">
    <div className="flex items-center justify-between mb-5">
      <SkeletonPulse className="w-28 h-4" />
      <SkeletonPulse className="w-16 h-4" />
    </div>
    <div className="space-y-3">
      {[1, 2, 3, 4].map(i => (
        <div key={i} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
          <SkeletonPulse className="w-12 h-12 rounded-lg" />
          <div className="flex-1">
            <SkeletonPulse className="w-full h-4 mb-2" />
            <SkeletonPulse className="w-16 h-5 rounded" />
          </div>
          <SkeletonPulse className="w-4 h-4" />
        </div>
      ))}
    </div>
  </div>
);

const DashboardSkeleton: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-50/50 p-6">
      {/* Header Skeleton */}
      <div className="mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <SkeletonPulse className="w-48 h-7 mb-2" />
            <SkeletonPulse className="w-64 h-4" />
          </div>
          <div className="flex items-center gap-3">
            <SkeletonPulse className="w-32 h-9 rounded-lg hidden sm:block" />
            <SkeletonPulse className="w-24 h-9 rounded-lg" />
          </div>
        </div>
      </div>

      {/* Stats Grid Skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[1, 2, 3, 4].map(i => (
          <StatCardSkeleton key={i} />
        ))}
      </div>

      {/* Charts Row Skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className="lg:col-span-2">
          <ChartSkeleton />
        </div>
        <PieChartSkeleton />
      </div>

      {/* Second Row Skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className="lg:col-span-2">
          <ChartSkeleton height={200} />
        </div>
        <QuickActionsSkeleton />
      </div>

      {/* Bottom Row Skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ActivitySkeleton />
        <EventsSkeleton />
      </div>
    </div>
  );
};

export default DashboardSkeleton;
