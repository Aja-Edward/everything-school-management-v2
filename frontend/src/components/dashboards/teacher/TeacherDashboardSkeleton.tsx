import React from 'react';

/**
 * Teacher Dashboard Skeleton Loader
 *
 * Displays a content-shaped skeleton that matches the teacher dashboard layout
 * for better perceived performance during loading.
 */

const SkeletonPulse: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`bg-gray-200 dark:bg-slate-700 animate-pulse rounded ${className}`} />
);

const StatCardSkeleton: React.FC = () => (
  <div className="bg-white/80 dark:bg-slate-800/60 backdrop-blur-sm rounded-2xl p-5 border border-slate-200/60 dark:border-slate-700/60">
    <div className="flex items-start justify-between mb-4">
      <SkeletonPulse className="w-11 h-11 rounded-xl" />
      <SkeletonPulse className="w-10 h-4" />
    </div>
    <SkeletonPulse className="w-16 h-8 mb-2" />
    <SkeletonPulse className="w-20 h-4" />
  </div>
);

const QuickActionSkeleton: React.FC = () => (
  <div className="bg-white/80 dark:bg-slate-800/60 backdrop-blur-sm rounded-xl p-4 border border-slate-200/60 dark:border-slate-700/60">
    <SkeletonPulse className="w-10 h-10 rounded-lg mb-3" />
    <SkeletonPulse className="w-20 h-4 mb-1" />
    <SkeletonPulse className="w-24 h-3" />
  </div>
);

const SectionSkeleton: React.FC<{ itemCount?: number }> = ({ itemCount = 3 }) => (
  <div className="bg-white/80 dark:bg-slate-800/60 backdrop-blur-sm rounded-2xl p-6 border border-slate-200/60 dark:border-slate-700/60">
    <div className="flex items-center justify-between mb-5">
      <div className="flex items-center gap-3">
        <SkeletonPulse className="w-10 h-10 rounded-xl" />
        <SkeletonPulse className="w-28 h-5" />
      </div>
      <SkeletonPulse className="w-20 h-8 rounded-lg" />
    </div>
    <div className="space-y-3">
      {Array.from({ length: itemCount }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50/80 dark:bg-slate-700/30">
          <SkeletonPulse className="w-9 h-9 rounded-lg flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <SkeletonPulse className="w-full max-w-[200px] h-4 mb-2" />
            <SkeletonPulse className="w-24 h-3" />
          </div>
          <SkeletonPulse className="w-12 h-4" />
        </div>
      ))}
    </div>
  </div>
);

const PerformanceCardSkeleton: React.FC = () => (
  <div className="bg-slate-50/80 dark:bg-slate-700/30 rounded-xl p-4">
    <div className="flex items-center gap-3 mb-2">
      <SkeletonPulse className="w-8 h-8 rounded-lg" />
      <SkeletonPulse className="w-16 h-8" />
    </div>
    <SkeletonPulse className="w-24 h-4" />
  </div>
);

const TeacherDashboardSkeleton: React.FC = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/20 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800">
      <div className="p-4 sm:p-6 lg:p-8 space-y-6">

        {/* Welcome Header Skeleton */}
        <div className="relative overflow-hidden bg-gradient-to-r from-slate-800 to-slate-900 dark:from-slate-900 dark:to-slate-950 rounded-2xl p-6 sm:p-8">
          <div className="relative flex flex-col lg:flex-row gap-6 lg:items-center lg:justify-between">
            <div className="flex-1 min-w-0">
              <SkeletonPulse className="w-28 h-4 mb-3 !bg-slate-700" />
              <SkeletonPulse className="w-64 h-8 mb-3 !bg-slate-700" />
              <SkeletonPulse className="w-48 h-4 mb-4 !bg-slate-700" />
              <div className="flex items-center gap-4">
                <SkeletonPulse className="w-32 h-4 !bg-slate-700" />
                <SkeletonPulse className="w-24 h-4 !bg-slate-700" />
              </div>
            </div>
            <div className="flex items-center gap-4 flex-shrink-0">
              <SkeletonPulse className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl !bg-slate-700" />
              <div className="hidden sm:block">
                <SkeletonPulse className="w-32 h-5 mb-2 !bg-slate-700" />
                <SkeletonPulse className="w-20 h-4 !bg-slate-700" />
              </div>
            </div>
          </div>
        </div>

        {/* Statistics Cards Skeleton */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <StatCardSkeleton key={i} />
          ))}
        </div>

        {/* Quick Actions Skeleton */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <QuickActionSkeleton key={i} />
          ))}
        </div>

        {/* Classes & Subjects Skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <SectionSkeleton itemCount={3} />
          <SectionSkeleton itemCount={3} />
        </div>

        {/* Exams Skeleton */}
        <SectionSkeleton itemCount={4} />

        {/* Recent Results Skeleton */}
        <SectionSkeleton itemCount={4} />

        {/* Activities & Events Skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <SectionSkeleton itemCount={3} />
          <SectionSkeleton itemCount={3} />
        </div>

        {/* Performance Overview Skeleton */}
        <div className="bg-white/80 dark:bg-slate-800/60 backdrop-blur-sm rounded-2xl p-6 border border-slate-200/60 dark:border-slate-700/60">
          <div className="flex items-center justify-between mb-6">
            <div>
              <SkeletonPulse className="w-40 h-5 mb-2" />
              <SkeletonPulse className="w-48 h-4" />
            </div>
            <SkeletonPulse className="w-10 h-10 rounded-xl" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => (
              <PerformanceCardSkeleton key={i} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TeacherDashboardSkeleton;
