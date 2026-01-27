/**
 * Fee Management Service
 *
 * Provides access to all fee management endpoints including:
 * - Fee structures
 * - Student fees
 * - Payments
 * - Payment gateways
 * - Payment plans
 * - Discounts
 * - Reminders
 * - Reports
 */

import api from './api';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface FeeStructure {
  id: number;
  name: string;
  grade_level?: number;
  stream?: number;
  amount: number;
  academic_session: number;
  term?: number;
  fee_type: string;
  description?: string;
  due_date?: string;
  is_mandatory: boolean;
  is_active: boolean;
}

export interface StudentFee {
  id: number;
  student: number;
  fee_structure: number;
  amount_due: number;
  amount_paid: number;
  balance: number;
  status: 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE';
  due_date?: string;
  discount_applied?: number;
  payment_plan?: number;
}

export interface Payment {
  id: number;
  student_fee: number;
  amount: number;
  payment_method: string;
  payment_gateway?: number;
  transaction_reference: string;
  status: 'PENDING' | 'SUCCESSFUL' | 'FAILED' | 'REFUNDED';
  payment_date: string;
  verified_at?: string;
  notes?: string;
}

export interface PaymentGateway {
  id: number;
  name: string;
  gateway_type: 'PAYSTACK' | 'FLUTTERWAVE' | 'STRIPE' | 'PAYPAL' | 'BANK_TRANSFER' | 'CASH';
  is_active: boolean;
  public_key?: string;
  secret_key?: string;
  merchant_id?: string;
  webhook_url?: string;
  configuration: Record<string, any>;
}

export interface PaymentAttempt {
  id: number;
  student_fee: number;
  amount: number;
  payment_gateway: number;
  status: 'INITIATED' | 'PROCESSING' | 'SUCCESSFUL' | 'FAILED' | 'TIMEOUT';
  error_message?: string;
  attempted_at: string;
}

export interface PaymentWebhook {
  id: number;
  payment_gateway: number;
  payload: Record<string, any>;
  status: 'PENDING' | 'PROCESSED' | 'FAILED';
  processed_at?: string;
  error_message?: string;
  received_at: string;
}

export interface PaymentPlan {
  id: number;
  student_fee: number;
  total_amount: number;
  number_of_installments: number;
  installment_amount: number;
  start_date: string;
  status: 'ACTIVE' | 'COMPLETED' | 'DEFAULTED' | 'CANCELLED';
  installments?: PaymentPlanInstallment[];
}

export interface PaymentPlanInstallment {
  id: number;
  payment_plan: number;
  installment_number: number;
  amount: number;
  due_date: string;
  payment?: number;
  status: 'PENDING' | 'PAID' | 'OVERDUE';
}

export interface FeeDiscount {
  id: number;
  name: string;
  discount_type: 'PERCENTAGE' | 'FIXED_AMOUNT';
  discount_value: number;
  applies_to: 'ALL' | 'GRADE_LEVEL' | 'STREAM' | 'FEE_TYPE';
  grade_levels?: number[];
  streams?: number[];
  fee_types?: string[];
  start_date?: string;
  end_date?: string;
  is_active: boolean;
}

export interface StudentDiscount {
  id: number;
  student: number;
  fee_discount: number;
  applied_at: string;
  is_active: boolean;
  reason?: string;
}

export interface PaymentReminder {
  id: number;
  student_fee: number;
  reminder_type: 'EMAIL' | 'SMS' | 'PUSH';
  scheduled_for: string;
  sent_at?: string;
  status: 'SCHEDULED' | 'SENT' | 'FAILED';
  message: string;
}

// ============================================================================
// FEE STRUCTURES
// ============================================================================

export const FeeStructureService = {
  /**
   * Get all fee structures
   */
  list: (params?: Record<string, any>) =>
    api.get('/api/fee/fee-structures/', params),

  /**
   * Get fee structures by class (grade level)
   */
  getByClass: (gradeLevel: number, params?: Record<string, any>) =>
    api.get('/api/fee/fee-structures/by_class/', {
      params: { grade_level: gradeLevel, ...params }
    }),

  /**
   * Get a single fee structure
   */
  get: (id: number) =>
    api.get(`/api/fee/fee-structures/${id}/`),

  /**
   * Create a new fee structure
   */
  create: (data: Partial<FeeStructure>) =>
    api.post('/api/fee/fee-structures/', data),

  /**
   * Update a fee structure
   */
  update: (id: number, data: Partial<FeeStructure>) =>
    api.patch(`/api/fee/fee-structures/${id}/`, data),

  /**
   * Delete a fee structure
   */
  delete: (id: number) =>
    api.delete(`/api/fee/fee-structures/${id}/`),
};

// ============================================================================
// STUDENT FEES
// ============================================================================

export const StudentFeeService = {
  /**
   * Get all student fees
   */
  list: (params?: Record<string, any>) =>
    api.get('/api/fee/student-fees/', params),

  /**
   * Get student fees dashboard data
   */
  getDashboard: (params?: Record<string, any>) =>
    api.get('/api/fee/student-fees/dashboard/', params),

  /**
   * Get overdue student fees
   */
  getOverdue: (params?: Record<string, any>) =>
    api.get('/api/fee/student-fees/overdue/', params),

  /**
   * Get a single student fee
   */
  get: (id: number) =>
    api.get(`/api/fee/student-fees/${id}/`),

  /**
   * Bulk generate student fees
   */
  bulkGenerate: (data: {
    fee_structure_id: number;
    student_ids?: number[];
    grade_level_id?: number;
  }) =>
    api.post('/api/fee/student-fees/bulk_generate/', data),

  /**
   * Apply discount to a student fee
   */
  applyDiscount: (id: number, data: { discount_id: number; reason?: string }) =>
    api.post(`/api/fee/student-fees/${id}/apply_discount/`, data),

  /**
   * Create payment plan for a student fee
   */
  createPaymentPlan: (id: number, data: {
    number_of_installments: number;
    start_date: string;
  }) =>
    api.post(`/api/fee/student-fees/${id}/create_payment_plan/`, data),

  /**
   * Update a student fee
   */
  update: (id: number, data: Partial<StudentFee>) =>
    api.patch(`/api/fee/student-fees/${id}/`, data),

  /**
   * Delete a student fee
   */
  delete: (id: number) =>
    api.delete(`/api/fee/student-fees/${id}/`),
};

// ============================================================================
// PAYMENTS
// ============================================================================

export const PaymentService = {
  /**
   * Get all payments
   */
  list: (params?: Record<string, any>) =>
    api.get('/api/fee/payments/', params),

  /**
   * Get payments by gateway
   */
  getByGateway: (gatewayId: number, params?: Record<string, any>) =>
    api.get('/api/fee/payments/by_gateway/', {
      params: { gateway: gatewayId, ...params }
    }),

  /**
   * Get available payment gateways (for payment initiation)
   */
  getAvailableGateways: () =>
    api.get('/api/fee/payments/gateways/'),

  /**
   * Initiate a payment
   */
  initiate: (data: {
    student_fee_id: number;
    amount: number;
    payment_gateway_id: number;
    payment_method: string;
  }) =>
    api.post('/api/fee/payments/initiate/', data),

  /**
   * Verify a payment
   */
  verify: (data: { transaction_reference: string }) =>
    api.post('/api/fee/payments/verify/', data),

  /**
   * Get a single payment
   */
  get: (id: number) =>
    api.get(`/api/fee/payments/${id}/`),

  /**
   * Get payment receipt
   */
  getReceipt: (id: number) =>
    api.get(`/api/fee/payments/${id}/receipt/`),

  /**
   * Process refund
   */
  refund: (id: number, data: { reason: string; amount?: number }) =>
    api.post(`/api/fee/payments/${id}/refund/`, data),

  /**
   * Update a payment
   */
  update: (id: number, data: Partial<Payment>) =>
    api.patch(`/api/fee/payments/${id}/`, data),
};

// ============================================================================
// PAYMENT GATEWAYS
// ============================================================================

export const PaymentGatewayService = {
  /**
   * Get all payment gateways
   */
  list: (params?: Record<string, any>) =>
    api.get('/api/fee/payment-gateways/', params),

  /**
   * Get a single payment gateway
   */
  get: (id: number) =>
    api.get(`/api/fee/payment-gateways/${id}/`),

  /**
   * Create a payment gateway configuration
   */
  create: (data: Partial<PaymentGateway>) =>
    api.post('/api/fee/payment-gateways/', data),

  /**
   * Update a payment gateway
   */
  update: (id: number, data: Partial<PaymentGateway>) =>
    api.patch(`/api/fee/payment-gateways/${id}/`, data),

  /**
   * Test gateway connection
   */
  testConnection: (id: number) =>
    api.post(`/api/fee/payment-gateways/${id}/test_connection/`, {}),

  /**
   * Toggle gateway status (enable/disable)
   */
  toggleStatus: (id: number) =>
    api.post(`/api/fee/payment-gateways/${id}/toggle_status/`, {}),

  /**
   * Delete a payment gateway
   */
  delete: (id: number) =>
    api.delete(`/api/fee/payment-gateways/${id}/`),
};

// ============================================================================
// PAYMENT ATTEMPTS (Read-only)
// ============================================================================

export const PaymentAttemptService = {
  /**
   * Get all payment attempts
   */
  list: (params?: Record<string, any>) =>
    api.get('/api/fee/payment-attempts/', params),

  /**
   * Get failure analysis
   */
  getFailureAnalysis: (params?: Record<string, any>) =>
    api.get('/api/fee/payment-attempts/failure_analysis/', params),

  /**
   * Get a single payment attempt
   */
  get: (id: number) =>
    api.get(`/api/fee/payment-attempts/${id}/`),
};

// ============================================================================
// PAYMENT WEBHOOKS (Read-only)
// ============================================================================

export const PaymentWebhookService = {
  /**
   * Get all payment webhooks
   */
  list: (params?: Record<string, any>) =>
    api.get('/api/fee/payment-webhooks/', params),

  /**
   * Get unprocessed webhooks
   */
  getUnprocessed: (params?: Record<string, any>) =>
    api.get('/api/fee/payment-webhooks/unprocessed/', params),

  /**
   * Get a single webhook
   */
  get: (id: number) =>
    api.get(`/api/fee/payment-webhooks/${id}/`),

  /**
   * Reprocess a webhook
   */
  reprocess: (id: number) =>
    api.post(`/api/fee/payment-webhooks/${id}/reprocess/`, {}),
};

// ============================================================================
// PAYMENT PLANS
// ============================================================================

export const PaymentPlanService = {
  /**
   * Get all payment plans
   */
  list: (params?: Record<string, any>) =>
    api.get('/api/fee/payment-plans/', params),

  /**
   * Get a single payment plan
   */
  get: (id: number) =>
    api.get(`/api/fee/payment-plans/${id}/`),

  /**
   * Get installments for a payment plan
   */
  getInstallments: (id: number) =>
    api.get(`/api/fee/payment-plans/${id}/installments/`),

  /**
   * Pay an installment
   */
  payInstallment: (id: number, data: {
    installment_number: number;
    amount: number;
    payment_method: string;
  }) =>
    api.post(`/api/fee/payment-plans/${id}/pay_installment/`, data),

  /**
   * Update a payment plan
   */
  update: (id: number, data: Partial<PaymentPlan>) =>
    api.patch(`/api/fee/payment-plans/${id}/`, data),

  /**
   * Delete a payment plan
   */
  delete: (id: number) =>
    api.delete(`/api/fee/payment-plans/${id}/`),
};

// ============================================================================
// FEE DISCOUNTS
// ============================================================================

export const FeeDiscountService = {
  /**
   * Get all fee discounts
   */
  list: (params?: Record<string, any>) =>
    api.get('/api/fee/fee-discounts/', params),

  /**
   * Get active discounts
   */
  getActive: (params?: Record<string, any>) =>
    api.get('/api/fee/fee-discounts/active/', params),

  /**
   * Get a single discount
   */
  get: (id: number) =>
    api.get(`/api/fee/fee-discounts/${id}/`),

  /**
   * Create a discount
   */
  create: (data: Partial<FeeDiscount>) =>
    api.post('/api/fee/fee-discounts/', data),

  /**
   * Update a discount
   */
  update: (id: number, data: Partial<FeeDiscount>) =>
    api.patch(`/api/fee/fee-discounts/${id}/`, data),

  /**
   * Delete a discount
   */
  delete: (id: number) =>
    api.delete(`/api/fee/fee-discounts/${id}/`),
};

// ============================================================================
// STUDENT DISCOUNTS
// ============================================================================

export const StudentDiscountService = {
  /**
   * Get all student discounts
   */
  list: (params?: Record<string, any>) =>
    api.get('/api/fee/student-discounts/', params),

  /**
   * Get a single student discount
   */
  get: (id: number) =>
    api.get(`/api/fee/student-discounts/${id}/`),

  /**
   * Create a student discount
   */
  create: (data: Partial<StudentDiscount>) =>
    api.post('/api/fee/student-discounts/', data),

  /**
   * Deactivate a student discount
   */
  deactivate: (id: number, data: { reason?: string }) =>
    api.post(`/api/fee/student-discounts/${id}/deactivate/`, data),

  /**
   * Delete a student discount
   */
  delete: (id: number) =>
    api.delete(`/api/fee/student-discounts/${id}/`),
};

// ============================================================================
// PAYMENT REMINDERS
// ============================================================================

export const PaymentReminderService = {
  /**
   * Get all payment reminders
   */
  list: (params?: Record<string, any>) =>
    api.get('/api/fee/payment-reminders/', params),

  /**
   * Get a single reminder
   */
  get: (id: number) =>
    api.get(`/api/fee/payment-reminders/${id}/`),

  /**
   * Create a reminder
   */
  create: (data: Partial<PaymentReminder>) =>
    api.post('/api/fee/payment-reminders/', data),

  /**
   * Send bulk reminders
   */
  sendBulk: (data: {
    student_fee_ids?: number[];
    reminder_type: 'EMAIL' | 'SMS' | 'PUSH';
    message: string;
  }) =>
    api.post('/api/fee/payment-reminders/send_bulk/', data),

  /**
   * Mark reminder as sent
   */
  markSent: (id: number) =>
    api.post(`/api/fee/payment-reminders/${id}/mark_sent/`, {}),

  /**
   * Delete a reminder
   */
  delete: (id: number) =>
    api.delete(`/api/fee/payment-reminders/${id}/`),
};

// ============================================================================
// REPORTS
// ============================================================================

export const FeeReportService = {
  /**
   * Generate a fee report
   */
  generate: (data: {
    report_type: string;
    start_date?: string;
    end_date?: string;
    grade_level_id?: number;
    academic_session_id?: number;
    term_id?: number;
  }) =>
    api.post('/api/fee/reports/generate/', data),

  /**
   * Export report as CSV
   */
  exportCSV: async (data: {
    report_type: string;
    start_date?: string;
    end_date?: string;
    grade_level_id?: number;
  }) => {
    // Use fetch directly for blob responses
    const response = await fetch('/api/fee/reports/export_csv/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response.blob();
  },

  /**
   * Get report summary
   */
  getSummary: (params?: Record<string, any>) =>
    api.get('/api/fee/reports/summary/', params),

  /**
   * Get payment analytics
   */
  getPaymentAnalytics: (params?: Record<string, any>) =>
    api.get('/api/fee/reports/payment_analytics/', params),

  /**
   * Get gateway performance report
   */
  getGatewayPerformance: (params?: Record<string, any>) =>
    api.get('/api/fee/reports/gateway_performance/', params),
};

// ============================================================================
// COMBINED EXPORT
// ============================================================================

const FeeManagementService = {
  FeeStructure: FeeStructureService,
  StudentFee: StudentFeeService,
  Payment: PaymentService,
  PaymentGateway: PaymentGatewayService,
  PaymentAttempt: PaymentAttemptService,
  PaymentWebhook: PaymentWebhookService,
  PaymentPlan: PaymentPlanService,
  FeeDiscount: FeeDiscountService,
  StudentDiscount: StudentDiscountService,
  PaymentReminder: PaymentReminderService,
  Report: FeeReportService,
};

export default FeeManagementService;
