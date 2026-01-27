import React, { useState } from 'react';
import { Alert as AlertType } from '../../../../services/AdminDashboardService';

interface AlertBannerProps {
  alerts: AlertType[];
  loading?: boolean;
  maxVisible?: number;
}

const AlertBanner: React.FC<AlertBannerProps> = ({
  alerts,
  loading = false,
  maxVisible = 5
}) => {
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<number>>(new Set());
  const [showAll, setShowAll] = useState(false);

  if (loading) {
    return (
      <div className="w-full space-y-2">
        {[1, 2].map((i) => (
          <div key={i} className="animate-pulse">
            <div className="h-16 bg-gray-200 rounded-lg"></div>
          </div>
        ))}
      </div>
    );
  }

  const visibleAlerts = alerts.filter((_, index) => !dismissedAlerts.has(index));

  if (visibleAlerts.length === 0) {
    return null;
  }

  const handleDismiss = (index: number) => {
    setDismissedAlerts(prev => new Set(prev).add(index));
  };

  const handleAction = (alert: AlertType) => {
    // Navigate to action URL
    if (alert.action_url) {
      window.location.href = alert.action_url;
    }
  };

  const getAlertStyles = (type: string, severity: string) => {
    switch (type) {
      case 'error':
        return {
          container: 'bg-red-50 border-red-200',
          icon: 'text-red-500',
          text: 'text-red-900',
          button: 'text-red-600 hover:text-red-700 bg-red-100 hover:bg-red-200'
        };
      case 'warning':
        return {
          container: 'bg-yellow-50 border-yellow-200',
          icon: 'text-yellow-500',
          text: 'text-yellow-900',
          button: 'text-yellow-600 hover:text-yellow-700 bg-yellow-100 hover:bg-yellow-200'
        };
      case 'info':
      default:
        return {
          container: 'bg-blue-50 border-blue-200',
          icon: 'text-blue-500',
          text: 'text-blue-900',
          button: 'text-blue-600 hover:text-blue-700 bg-blue-100 hover:bg-blue-200'
        };
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'high':
        return 'bg-red-100 text-red-700 border-red-300';
      case 'medium':
        return 'bg-yellow-100 text-yellow-700 border-yellow-300';
      case 'low':
      default:
        return 'bg-blue-100 text-blue-700 border-blue-300';
    }
  };

  const displayedAlerts = showAll
    ? visibleAlerts
    : visibleAlerts.slice(0, maxVisible);

  return (
    <div className="w-full space-y-2">
      {displayedAlerts.map((alert, index) => {
        const styles = getAlertStyles(alert.type, alert.severity);

        return (
          <div
            key={index}
            className={`relative flex items-start gap-3 p-4 rounded-lg border ${styles.container} transition-all duration-300`}
          >
            {/* Icon */}
            <div className={`flex-shrink-0 text-2xl ${styles.icon}`}>
              {alert.icon}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className={`font-semibold text-sm ${styles.text}`}>
                      {alert.title}
                    </h4>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase ${getSeverityBadge(
                        alert.severity
                      )}`}
                    >
                      {alert.severity}
                    </span>
                  </div>
                  <p className={`text-sm ${styles.text} opacity-90`}>
                    {alert.message}
                  </p>
                </div>

                {/* Dismiss Button */}
                <button
                  onClick={() => handleDismiss(index)}
                  className={`flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors`}
                  aria-label="Dismiss alert"
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path d="M6 18L18 6M6 6l12 12"></path>
                  </svg>
                </button>
              </div>

              {/* Action Button */}
              {alert.action && alert.action_url && (
                <div className="mt-3">
                  <button
                    onClick={() => handleAction(alert)}
                    className={`text-sm font-medium px-3 py-1.5 rounded transition-colors ${styles.button}`}
                  >
                    {alert.action} →
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* Show More/Less Button */}
      {visibleAlerts.length > maxVisible && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="w-full text-sm text-gray-600 hover:text-gray-800 font-medium py-2 text-center border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
        >
          {showAll
            ? 'Show Less'
            : `Show ${visibleAlerts.length - maxVisible} More Alerts`}
        </button>
      )}

      {/* Dismissed Counter */}
      {dismissedAlerts.size > 0 && (
        <div className="text-xs text-gray-500 text-center py-2">
          {dismissedAlerts.size} alert{dismissedAlerts.size > 1 ? 's' : ''} dismissed
        </div>
      )}
    </div>
  );
};

export default AlertBanner;
