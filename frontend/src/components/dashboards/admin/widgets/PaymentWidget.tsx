import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../../ui/card';
import { PaymentStatistics } from '../../../../services/AdminDashboardService';

interface PaymentWidgetProps {
  data: PaymentStatistics | null;
  loading?: boolean;
}

const PaymentWidget: React.FC<PaymentWidgetProps> = ({ data, loading = false }) => {
  if (loading) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Payment Statistics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
            <div className="h-4 bg-gray-200 rounded w-2/3"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Payment Statistics</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-500 text-sm">No payment data available</p>
        </CardContent>
      </Card>
    );
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const getCollectionRateColor = (rate: number) => {
    if (rate >= 90) return 'text-green-600';
    if (rate >= 75) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-lg font-semibold flex items-center justify-between">
          <span>Payment Statistics</span>
          <span className={`text-2xl font-bold ${getCollectionRateColor(data.collection_rate)}`}>
            {data.collection_rate.toFixed(1)}%
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 gap-3">
          {/* Total Expected */}
          <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
            <p className="text-xs text-blue-600 font-medium mb-1">Total Expected</p>
            <p className="text-lg font-bold text-blue-900">{formatCurrency(data.total_fees_expected)}</p>
          </div>

          {/* Total Collected */}
          <div className="bg-green-50 p-3 rounded-lg border border-green-100">
            <p className="text-xs text-green-600 font-medium mb-1">Collected</p>
            <p className="text-lg font-bold text-green-900">{formatCurrency(data.total_collected)}</p>
          </div>

          {/* Total Pending */}
          <div className="bg-yellow-50 p-3 rounded-lg border border-yellow-100">
            <p className="text-xs text-yellow-600 font-medium mb-1">Pending</p>
            <p className="text-lg font-bold text-yellow-900">{formatCurrency(data.total_pending)}</p>
          </div>

          {/* Overdue */}
          <div className="bg-red-50 p-3 rounded-lg border border-red-100">
            <p className="text-xs text-red-600 font-medium mb-1">Overdue</p>
            <p className="text-lg font-bold text-red-900">{formatCurrency(data.total_overdue)}</p>
          </div>
        </div>

        {/* This Month */}
        <div className="bg-purple-50 p-3 rounded-lg border border-purple-100">
          <p className="text-xs text-purple-600 font-medium mb-1">This Month Collected</p>
          <p className="text-xl font-bold text-purple-900">{formatCurrency(data.this_month_collected)}</p>
        </div>

        {/* Payment Counts */}
        <div className="border-t pt-3">
          <p className="text-sm font-semibold text-gray-700 mb-2">Payment Status</p>
          <div className="flex justify-between items-center text-sm">
            <span className="text-gray-600">Completed:</span>
            <span className="font-semibold text-green-700">{data.completed_count}</span>
          </div>
          <div className="flex justify-between items-center text-sm mt-1">
            <span className="text-gray-600">Pending:</span>
            <span className="font-semibold text-yellow-700">{data.pending_count}</span>
          </div>
          <div className="flex justify-between items-center text-sm mt-1">
            <span className="text-gray-600">Total Transactions:</span>
            <span className="font-semibold text-gray-900">{data.payments_count}</span>
          </div>
        </div>

        {/* Collection Rate Progress Bar */}
        <div className="border-t pt-3">
          <p className="text-sm font-semibold text-gray-700 mb-2">Collection Rate</p>
          <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
            <div
              className={`h-3 rounded-full transition-all duration-500 ${
                data.collection_rate >= 90
                  ? 'bg-green-500'
                  : data.collection_rate >= 75
                  ? 'bg-yellow-500'
                  : 'bg-red-500'
              }`}
              style={{ width: `${Math.min(data.collection_rate, 100)}%` }}
            />
          </div>
          <p className="text-xs text-gray-500 mt-1 text-right">
            {formatCurrency(data.total_collected)} of {formatCurrency(data.total_fees_expected)}
          </p>
        </div>

        {/* Payment Trends Mini Chart (Last 7 days) */}
        {data.payment_trends && data.payment_trends.length > 0 && (
          <div className="border-t pt-3">
            <p className="text-sm font-semibold text-gray-700 mb-2">Recent Trend (Last 7 Days)</p>
            <div className="flex items-end justify-between h-16 gap-1">
              {data.payment_trends.slice(-7).map((trend, index) => {
                const maxAmount = Math.max(...data.payment_trends.map(t => t.amount));
                const height = maxAmount > 0 ? (trend.amount / maxAmount) * 100 : 0;

                return (
                  <div key={index} className="flex-1 flex flex-col items-center">
                    <div
                      className="w-full bg-blue-500 rounded-t hover:bg-blue-600 transition-colors cursor-pointer"
                      style={{ height: `${height}%` }}
                      title={`${new Date(trend.date).toLocaleDateString()}: ${formatCurrency(trend.amount)}`}
                    />
                    <p className="text-[10px] text-gray-500 mt-1">
                      {new Date(trend.date).toLocaleDateString('en-US', { weekday: 'short' })}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default PaymentWidget;
