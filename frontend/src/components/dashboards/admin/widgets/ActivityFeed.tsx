import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../../ui/card';
import { ActivityItem } from '../../../../services/AdminDashboardService';

interface ActivityFeedProps {
  activities: ActivityItem[];
  loading?: boolean;
  maxItems?: number;
}

const ActivityFeed: React.FC<ActivityFeedProps> = ({
  activities,
  loading = false,
  maxItems = 10
}) => {
  if (loading) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Recent Activities</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="w-8 h-8 bg-gray-200 rounded-full"></div>
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                  <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!activities || activities.length === 0) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Recent Activities</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-500 text-sm text-center py-8">No recent activities</p>
        </CardContent>
      </Card>
    );
  }

  const getActivityColor = (type: string) => {
    switch (type) {
      case 'enrollment':
        return 'bg-blue-100 text-blue-600 border-blue-200';
      case 'exam':
        return 'bg-purple-100 text-purple-600 border-purple-200';
      case 'announcement':
        return 'bg-yellow-100 text-yellow-600 border-yellow-200';
      case 'payment':
        return 'bg-green-100 text-green-600 border-green-200';
      case 'attendance':
        return 'bg-orange-100 text-orange-600 border-orange-200';
      default:
        return 'bg-gray-100 text-gray-600 border-gray-200';
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'bg-red-100 text-red-700 border-red-200';
      case 'normal':
        return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'low':
        return 'bg-gray-100 text-gray-700 border-gray-200';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const formatTimeAgo = (timestamp: string) => {
    const now = new Date();
    const activityTime = new Date(timestamp);
    const diffMs = now.getTime() - activityTime.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return activityTime.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    });
  };

  const displayedActivities = activities.slice(0, maxItems);

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold">Recent Activities</CardTitle>
          <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
            {activities.length} total
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
          {displayedActivities.map((activity, index) => (
            <div
              key={index}
              className="flex items-start gap-3 p-3 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors"
            >
              {/* Icon */}
              <div
                className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center border ${getActivityColor(
                  activity.type
                )}`}
              >
                <span className="text-lg">{activity.icon}</span>
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-900 mb-1">
                      {activity.title}
                    </p>
                    <p className="text-sm text-gray-600 line-clamp-2">
                      {activity.description}
                    </p>
                  </div>
                  {activity.priority === 'high' && (
                    <span
                      className={`flex-shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded border ${getPriorityBadge(
                        activity.priority
                      )}`}
                    >
                      HIGH
                    </span>
                  )}
                </div>

                {/* Timestamp and Type */}
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-xs text-gray-500">
                    {formatTimeAgo(activity.timestamp)}
                  </span>
                  <span className="text-gray-300">•</span>
                  <span className="text-xs text-gray-500 capitalize">
                    {activity.type}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {activities.length > maxItems && (
          <div className="mt-3 pt-3 border-t text-center">
            <button className="text-sm text-blue-600 hover:text-blue-700 font-medium">
              View all {activities.length} activities →
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ActivityFeed;
