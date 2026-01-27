/**
 * Fee Service
 *
 * Comprehensive fee management service covering:
 * - Fee Structures
 * - Student Fees
 * - Payments (multi-gateway support)
 * - Payment Plans & Installments
 * - Discounts
 * - Payment Reminders
 * - Financial Reports & Analytics
 */

import api from './api';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

// Fee Structure Types
export interface FeeStructure {
  id: number;
  name: string;
  description?: string;
  amount: number;
  education_level: 'NURSERY' | 'PRIMARY' | 'JUNIOR_SECONDARY' | 'SENIOR_SECONDARY';
  student_class?: number;
  student_class_name?: string;
  fee_type: string;
  frequency: 'ONCE' | 'TERMLY' | 'YEARLY' | 'MONTHLY';
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateFeeStructureData {
  name: string;
  description?: string;
  amount: number;
  education_level: string;
  student_class?: number;
  fee_type: string;
  frequency: string;
  is_active?: boolean;
}

export interface UpdateFeeStructureData extends Partial<CreateFeeStructureData> {}

export interface FeeStructureFilters {
  education_level?: string;
  student_class?: number;
  fee_type?: string;
  frequency?: string;
  is_active?: boolean;
  search?: string;
  ordering?: string;
  page?: number;
  page_size?: number;
}

// Student Fee Types
export interface StudentFee {
  id: number;
  student: number;
  student_name?: string;
  student_admission_number?: string;
  fee_structure: number;
  fee_structure_name?: string;
  academic_session: number;
  academic_session_name?: string;
  term?: number;
  term_name?: string;
  amount_due: number;
  amount_paid: number;
  amount_balance: number;
  due_date: string;
  status: 'PENDING' | 'PARTIAL' | 'PAID' | 'OVERDUE' | 'CANCELLED';
  status_display?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateStudentFeeData {
  student: number;
  fee_structure: number;
  academic_session: number;
  term?: number;
  amount_due?: number;
  due_date: string;
}

export interface UpdateStudentFeeData extends Partial<CreateStudentFeeData> {
  status?: string;
  amount_paid?: number;
}

export interface StudentFeeFilters {
  student?: number;
  fee_structure?: number;
  academic_session?: number;
  term?: number;
  status?: string;
  search?: string;
  ordering?: string;
  page?: number;
  page_size?: number;
}

export interface BulkFeeGenerationData {
  fee_structure_ids: number[];
  student_ids?: number[];
  education_level?: string;
  student_class?: number;
  academic_session: number;
  term?: number;
  due_date: string;
}

// Payment Types
export interface Payment {
  id: number;
  student_fee: number;
  student_fee_details?: StudentFee;
  amount: number;
  payment_method: string;
  payment_gateway: 'PAYSTACK' | 'FLUTTERWAVE' | 'BANK_TRANSFER' | 'CASH';
  payment_gateway_display?: string;
  reference: string;
  gateway_reference?: string;
  gateway_status?: string;
  verified: boolean;
  payment_date: string;
  receipt_number?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface PaymentInitiationData {
  student_fee_id: number;
  amount: number;
  payment_gateway: string;
  payment_method?: string;
  callback_url?: string;
}

export interface PaymentVerificationData {
  reference: string;
}

export interface PaymentFilters {
  student_fee?: number;
  payment_gateway?: string;
  gateway_status?: string;
  verified?: boolean;
  search?: string;
  ordering?: string;
  page?: number;
  page_size?: number;
}

// Payment Gateway Types
export interface PaymentGatewayConfig {
  id: number;
  gateway: string;
  is_active: boolean;
  is_test_mode: boolean;
  public_key?: string;
  webhook_url?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateGatewayConfigData {
  gateway: string;
  is_active?: boolean;
  is_test_mode?: boolean;
  public_key?: string;
  secret_key?: string;
  webhook_url?: string;
}

export interface UpdateGatewayConfigData extends Partial<CreateGatewayConfigData> {}

// Payment Plan Types
export interface PaymentPlan {
  id: number;
  student_fee: number;
  name: string;
  description?: string;
  total_amount: number;
  number_of_installments: number;
  start_date: string;
  is_active: boolean;
  is_completed: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreatePaymentPlanData {
  name: string;
  description?: string;
  number_of_installments: number;
  start_date: string;
  installment_amounts?: number[];
  installment_dates?: string[];
}

export interface PaymentInstallment {
  id: number;
  payment_plan: number;
  installment_number: number;
  amount: number;
  due_date: string;
  is_paid: boolean;
  paid_date?: string;
  payment?: number;
  created_at: string;
}

// Discount Types
export interface FeeDiscount {
  id: number;
  name: string;
  description?: string;
  discount_type: 'PERCENTAGE' | 'FIXED_AMOUNT';
  value: number;
  is_active: boolean;
  valid_from?: string;
  valid_until?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateDiscountData {
  name: string;
  description?: string;
  discount_type: string;
  value: number;
  is_active?: boolean;
  valid_from?: string;
  valid_until?: string;
}

export interface UpdateDiscountData extends Partial<CreateDiscountData> {}

export interface StudentDiscount {
  id: number;
  student: number;
  student_name?: string;
  discount: number;
  discount_details?: FeeDiscount;
  applied_by: number;
  applied_by_name?: string;
  applied_date: string;
  is_active: boolean;
}

// Payment Reminder Types
export interface PaymentReminder {
  id: number;
  student_fee: number;
  student_fee_details?: StudentFee;
  reminder_type: 'EMAIL' | 'SMS' | 'BOTH';
  message: string;
  sent: boolean;
  sent_date?: string;
  created_at: string;
}

export interface CreateReminderData {
  student_fee: number;
  reminder_type: string;
  message?: string;
}

// Report Types
export interface FeeReportData {
  report_type: string;
  start_date?: string;
  end_date?: string;
  education_level?: string;
  student_class?: number;
  academic_session?: number;
}

export interface FeeSummary {
  session: any;
  financial_summary: {
    total_due: number;
    total_paid: number;
    total_balance: number;
  };
  fee_counts: {
    total_students: number;
    total_fees: number;
    paid_fees: number;
    overdue_fees: number;
    pending_fees: number;
  };
  gateway_statistics: Array<{
    payment_gateway: string;
    total_amount: number;
    count: number;
  }>;
}

// ============================================================================
// FEE SERVICE
// ============================================================================

class FeeService {
  // ============================================================================
  // FEE STRUCTURE MANAGEMENT
  // ============================================================================

  /**
   * Get all fee structures
   */
  async getFeeStructures(params?: FeeStructureFilters): Promise<FeeStructure[]> {
    try {
      const response = await api.get('/api/fees/fee-structures/', params);
      return response.results || response;
    } catch (error) {
      console.error('Error fetching fee structures:', error);
      throw error;
    }
  }

  /**
   * Get a single fee structure by ID
   */
  async getFeeStructure(id: number): Promise<FeeStructure> {
    try {
      const response = await api.get(`/api/fees/fee-structures/${id}/`);
      return response;
    } catch (error) {
      console.error(`Error fetching fee structure ${id}:`, error);
      throw error;
    }
  }

  /**
   * Create a new fee structure
   */
  async createFeeStructure(data: CreateFeeStructureData): Promise<FeeStructure> {
    try {
      const response = await api.post('/api/fees/fee-structures/', data);
      return response;
    } catch (error) {
      console.error('Error creating fee structure:', error);
      throw error;
    }
  }

  /**
   * Update a fee structure
   */
  async updateFeeStructure(id: number, data: UpdateFeeStructureData): Promise<FeeStructure> {
    try {
      const response = await api.patch(`/api/fees/fee-structures/${id}/`, data);
      return response;
    } catch (error) {
      console.error(`Error updating fee structure ${id}:`, error);
      throw error;
    }
  }

  /**
   * Delete a fee structure
   */
  async deleteFeeStructure(id: number): Promise<void> {
    try {
      await api.delete(`/api/fees/fee-structures/${id}/`);
    } catch (error) {
      console.error(`Error deleting fee structure ${id}:`, error);
      throw error;
    }
  }

  /**
   * Get fee structures by class
   */
  async getFeeStructuresByClass(params?: {
    education_level?: string;
    student_class?: number;
  }): Promise<FeeStructure[]> {
    try {
      const response = await api.get('/api/fees/fee-structures/by_class/', params);
      return response.results || response;
    } catch (error) {
      console.error('Error fetching fee structures by class:', error);
      throw error;
    }
  }

  // ============================================================================
  // STUDENT FEE MANAGEMENT
  // ============================================================================

  /**
   * Get all student fees
   */
  async getStudentFees(params?: StudentFeeFilters): Promise<StudentFee[]> {
    try {
      const response = await api.get('/api/fees/student-fees/', params);
      return response.results || response;
    } catch (error) {
      console.error('Error fetching student fees:', error);
      throw error;
    }
  }

  /**
   * Get a single student fee by ID
   */
  async getStudentFee(id: number): Promise<StudentFee> {
    try {
      const response = await api.get(`/api/fees/student-fees/${id}/`);
      return response;
    } catch (error) {
      console.error(`Error fetching student fee ${id}:`, error);
      throw error;
    }
  }

  /**
   * Create a new student fee
   */
  async createStudentFee(data: CreateStudentFeeData): Promise<StudentFee> {
    try {
      const response = await api.post('/api/fees/student-fees/', data);
      return response;
    } catch (error) {
      console.error('Error creating student fee:', error);
      throw error;
    }
  }

  /**
   * Update a student fee
   */
  async updateStudentFee(id: number, data: UpdateStudentFeeData): Promise<StudentFee> {
    try {
      const response = await api.patch(`/api/fees/student-fees/${id}/`, data);
      return response;
    } catch (error) {
      console.error(`Error updating student fee ${id}:`, error);
      throw error;
    }
  }

  /**
   * Delete a student fee
   */
  async deleteStudentFee(id: number): Promise<void> {
    try {
      await api.delete(`/api/fees/student-fees/${id}/`);
    } catch (error) {
      console.error(`Error deleting student fee ${id}:`, error);
      throw error;
    }
  }

  /**
   * Get student fee dashboard data
   */
  async getStudentFeeDashboard(): Promise<any> {
    try {
      const response = await api.get('/api/fees/student-fees/dashboard/');
      return response;
    } catch (error) {
      console.error('Error fetching student fee dashboard:', error);
      throw error;
    }
  }

  /**
   * Get overdue fees
   */
  async getOverdueFees(params?: StudentFeeFilters): Promise<StudentFee[]> {
    try {
      const response = await api.get('/api/fees/student-fees/overdue/', params);
      return response.results || response;
    } catch (error) {
      console.error('Error fetching overdue fees:', error);
      throw error;
    }
  }

  /**
   * Apply discount to a student fee
   */
  async applyDiscount(studentFeeId: number, discountId: number): Promise<any> {
    try {
      const response = await api.post(`/api/fees/student-fees/${studentFeeId}/apply_discount/`, {
        discount_id: discountId,
      });
      return response;
    } catch (error) {
      console.error(`Error applying discount to student fee ${studentFeeId}:`, error);
      throw error;
    }
  }

  /**
   * Bulk generate fees for students
   */
  async bulkGenerateFees(data: BulkFeeGenerationData): Promise<any> {
    try {
      const response = await api.post('/api/fees/student-fees/bulk_generate/', data);
      return response;
    } catch (error) {
      console.error('Error bulk generating fees:', error);
      throw error;
    }
  }

  /**
   * Create payment plan for a student fee
   */
  async createPaymentPlanForFee(
    studentFeeId: number,
    data: CreatePaymentPlanData
  ): Promise<PaymentPlan> {
    try {
      const response = await api.post(
        `/api/fees/student-fees/${studentFeeId}/create_payment_plan/`,
        data
      );
      return response;
    } catch (error) {
      console.error(`Error creating payment plan for fee ${studentFeeId}:`, error);
      throw error;
    }
  }

  // ============================================================================
  // PAYMENT MANAGEMENT
  // ============================================================================

  /**
   * Get all payments
   */
  async getPayments(params?: PaymentFilters): Promise<Payment[]> {
    try {
      const response = await api.get('/api/fees/payments/', params);
      return response.results || response;
    } catch (error) {
      console.error('Error fetching payments:', error);
      throw error;
    }
  }

  /**
   * Get a single payment by ID
   */
  async getPayment(id: number): Promise<Payment> {
    try {
      const response = await api.get(`/api/fees/payments/${id}/`);
      return response;
    } catch (error) {
      console.error(`Error fetching payment ${id}:`, error);
      throw error;
    }
  }

  /**
   * Initiate a payment
   */
  async initiatePayment(data: PaymentInitiationData): Promise<any> {
    try {
      const response = await api.post('/api/fees/payments/initiate/', data);
      return response;
    } catch (error) {
      console.error('Error initiating payment:', error);
      throw error;
    }
  }

  /**
   * Verify a payment
   */
  async verifyPayment(reference: string): Promise<any> {
    try {
      const response = await api.post('/api/fees/payments/verify/', { reference });
      return response;
    } catch (error) {
      console.error('Error verifying payment:', error);
      throw error;
    }
  }

  /**
   * Get payment receipt
   */
  async getPaymentReceipt(paymentId: number): Promise<any> {
    try {
      const response = await api.get(`/api/fees/payments/${paymentId}/receipt/`);
      return response;
    } catch (error) {
      console.error(`Error fetching payment receipt ${paymentId}:`, error);
      throw error;
    }
  }

  /**
   * Get available payment gateways
   */
  async getPaymentGateways(): Promise<PaymentGatewayConfig[]> {
    try {
      const response = await api.get('/api/fees/payments/gateways/');
      return response.results || response;
    } catch (error) {
      console.error('Error fetching payment gateways:', error);
      throw error;
    }
  }

  /**
   * Get payments by gateway
   */
  async getPaymentsByGateway(params?: {
    gateway?: string;
    status?: string;
  }): Promise<Payment[]> {
    try {
      const response = await api.get('/api/fees/payments/by_gateway/', params);
      return response.results || response;
    } catch (error) {
      console.error('Error fetching payments by gateway:', error);
      throw error;
    }
  }

  /**
   * Initiate payment refund
   */
  async refundPayment(paymentId: number, reason?: string): Promise<any> {
    try {
      const response = await api.post(`/api/fees/payments/${paymentId}/refund/`, {
        reason,
      });
      return response;
    } catch (error) {
      console.error(`Error refunding payment ${paymentId}:`, error);
      throw error;
    }
  }

  // ============================================================================
  // PAYMENT GATEWAY CONFIGURATION
  // ============================================================================

  /**
   * Get all gateway configurations
   */
  async getGatewayConfigs(params?: { gateway?: string; is_active?: boolean }): Promise<PaymentGatewayConfig[]> {
    try {
      const response = await api.get('/api/fees/payment-gateways/', params);
      return response.results || response;
    } catch (error) {
      console.error('Error fetching gateway configs:', error);
      throw error;
    }
  }

  /**
   * Get a single gateway config by ID
   */
  async getGatewayConfig(id: number): Promise<PaymentGatewayConfig> {
    try {
      const response = await api.get(`/api/fees/payment-gateways/${id}/`);
      return response;
    } catch (error) {
      console.error(`Error fetching gateway config ${id}:`, error);
      throw error;
    }
  }

  /**
   * Create a gateway configuration
   */
  async createGatewayConfig(data: CreateGatewayConfigData): Promise<PaymentGatewayConfig> {
    try {
      const response = await api.post('/api/fees/payment-gateways/', data);
      return response;
    } catch (error) {
      console.error('Error creating gateway config:', error);
      throw error;
    }
  }

  /**
   * Update a gateway configuration
   */
  async updateGatewayConfig(id: number, data: UpdateGatewayConfigData): Promise<PaymentGatewayConfig> {
    try {
      const response = await api.patch(`/api/fees/payment-gateways/${id}/`, data);
      return response;
    } catch (error) {
      console.error(`Error updating gateway config ${id}:`, error);
      throw error;
    }
  }

  /**
   * Delete a gateway configuration
   */
  async deleteGatewayConfig(id: number): Promise<void> {
    try {
      await api.delete(`/api/fees/payment-gateways/${id}/`);
    } catch (error) {
      console.error(`Error deleting gateway config ${id}:`, error);
      throw error;
    }
  }

  /**
   * Toggle gateway status
   */
  async toggleGatewayStatus(id: number): Promise<any> {
    try {
      const response = await api.post(`/api/fees/payment-gateways/${id}/toggle_status/`, {});
      return response;
    } catch (error) {
      console.error(`Error toggling gateway status ${id}:`, error);
      throw error;
    }
  }

  /**
   * Test gateway connection
   */
  async testGatewayConnection(id: number): Promise<any> {
    try {
      const response = await api.post(`/api/fees/payment-gateways/${id}/test_connection/`, {});
      return response;
    } catch (error) {
      console.error(`Error testing gateway connection ${id}:`, error);
      throw error;
    }
  }

  // ============================================================================
  // PAYMENT ATTEMPTS (Read-Only)
  // ============================================================================

  /**
   * Get all payment attempts
   */
  async getPaymentAttempts(params?: any): Promise<any[]> {
    try {
      const response = await api.get('/api/fees/payment-attempts/', params);
      return response.results || response;
    } catch (error) {
      console.error('Error fetching payment attempts:', error);
      throw error;
    }
  }

  /**
   * Get payment failure analysis
   */
  async getPaymentFailureAnalysis(): Promise<any> {
    try {
      const response = await api.get('/api/fees/payment-attempts/failure_analysis/');
      return response;
    } catch (error) {
      console.error('Error fetching payment failure analysis:', error);
      throw error;
    }
  }

  // ============================================================================
  // PAYMENT WEBHOOKS (Read-Only)
  // ============================================================================

  /**
   * Get all payment webhooks
   */
  async getPaymentWebhooks(params?: any): Promise<any[]> {
    try {
      const response = await api.get('/api/fees/payment-webhooks/', params);
      return response.results || response;
    } catch (error) {
      console.error('Error fetching payment webhooks:', error);
      throw error;
    }
  }

  /**
   * Reprocess a webhook
   */
  async reprocessWebhook(webhookId: number): Promise<any> {
    try {
      const response = await api.post(`/api/fees/payment-webhooks/${webhookId}/reprocess/`, {});
      return response;
    } catch (error) {
      console.error(`Error reprocessing webhook ${webhookId}:`, error);
      throw error;
    }
  }

  /**
   * Get unprocessed webhooks
   */
  async getUnprocessedWebhooks(): Promise<any[]> {
    try {
      const response = await api.get('/api/fees/payment-webhooks/unprocessed/');
      return response.results || response;
    } catch (error) {
      console.error('Error fetching unprocessed webhooks:', error);
      throw error;
    }
  }

  // ============================================================================
  // PAYMENT PLANS & INSTALLMENTS
  // ============================================================================

  /**
   * Get all payment plans
   */
  async getPaymentPlans(params?: any): Promise<PaymentPlan[]> {
    try {
      const response = await api.get('/api/fees/payment-plans/', params);
      return response.results || response;
    } catch (error) {
      console.error('Error fetching payment plans:', error);
      throw error;
    }
  }

  /**
   * Get a single payment plan by ID
   */
  async getPaymentPlan(id: number): Promise<PaymentPlan> {
    try {
      const response = await api.get(`/api/fees/payment-plans/${id}/`);
      return response;
    } catch (error) {
      console.error(`Error fetching payment plan ${id}:`, error);
      throw error;
    }
  }

  /**
   * Get installments for a payment plan
   */
  async getPaymentPlanInstallments(planId: number): Promise<PaymentInstallment[]> {
    try {
      const response = await api.get(`/api/fees/payment-plans/${planId}/installments/`);
      return response.results || response;
    } catch (error) {
      console.error(`Error fetching installments for plan ${planId}:`, error);
      throw error;
    }
  }

  /**
   * Pay a specific installment
   */
  async payInstallment(planId: number, installmentNumber: number, data: any): Promise<any> {
    try {
      const response = await api.post(`/api/fees/payment-plans/${planId}/pay_installment/`, {
        installment_number: installmentNumber,
        ...data,
      });
      return response;
    } catch (error) {
      console.error(`Error paying installment ${installmentNumber} for plan ${planId}:`, error);
      throw error;
    }
  }

  // ============================================================================
  // DISCOUNT MANAGEMENT
  // ============================================================================

  /**
   * Get all fee discounts
   */
  async getFeeDiscounts(params?: any): Promise<FeeDiscount[]> {
    try {
      const response = await api.get('/api/fees/fee-discounts/', params);
      return response.results || response;
    } catch (error) {
      console.error('Error fetching fee discounts:', error);
      throw error;
    }
  }

  /**
   * Get a single fee discount by ID
   */
  async getFeeDiscount(id: number): Promise<FeeDiscount> {
    try {
      const response = await api.get(`/api/fees/fee-discounts/${id}/`);
      return response;
    } catch (error) {
      console.error(`Error fetching fee discount ${id}:`, error);
      throw error;
    }
  }

  /**
   * Create a fee discount
   */
  async createFeeDiscount(data: CreateDiscountData): Promise<FeeDiscount> {
    try {
      const response = await api.post('/api/fees/fee-discounts/', data);
      return response;
    } catch (error) {
      console.error('Error creating fee discount:', error);
      throw error;
    }
  }

  /**
   * Update a fee discount
   */
  async updateFeeDiscount(id: number, data: UpdateDiscountData): Promise<FeeDiscount> {
    try {
      const response = await api.patch(`/api/fees/fee-discounts/${id}/`, data);
      return response;
    } catch (error) {
      console.error(`Error updating fee discount ${id}:`, error);
      throw error;
    }
  }

  /**
   * Delete a fee discount
   */
  async deleteFeeDiscount(id: number): Promise<void> {
    try {
      await api.delete(`/api/fees/fee-discounts/${id}/`);
    } catch (error) {
      console.error(`Error deleting fee discount ${id}:`, error);
      throw error;
    }
  }

  /**
   * Get active discounts
   */
  async getActiveDiscounts(params?: any): Promise<FeeDiscount[]> {
    try {
      const response = await api.get('/api/fees/fee-discounts/active/', params);
      return response.results || response;
    } catch (error) {
      console.error('Error fetching active discounts:', error);
      throw error;
    }
  }

  // ============================================================================
  // STUDENT DISCOUNT MANAGEMENT
  // ============================================================================

  /**
   * Get all student discounts
   */
  async getStudentDiscounts(params?: any): Promise<StudentDiscount[]> {
    try {
      const response = await api.get('/api/fees/student-discounts/', params);
      return response.results || response;
    } catch (error) {
      console.error('Error fetching student discounts:', error);
      throw error;
    }
  }

  /**
   * Get a single student discount by ID
   */
  async getStudentDiscount(id: number): Promise<StudentDiscount> {
    try {
      const response = await api.get(`/api/fees/student-discounts/${id}/`);
      return response;
    } catch (error) {
      console.error(`Error fetching student discount ${id}:`, error);
      throw error;
    }
  }

  /**
   * Deactivate a student discount
   */
  async deactivateStudentDiscount(id: number): Promise<any> {
    try {
      const response = await api.post(`/api/fees/student-discounts/${id}/deactivate/`, {});
      return response;
    } catch (error) {
      console.error(`Error deactivating student discount ${id}:`, error);
      throw error;
    }
  }

  // ============================================================================
  // PAYMENT REMINDER MANAGEMENT
  // ============================================================================

  /**
   * Get all payment reminders
   */
  async getPaymentReminders(params?: any): Promise<PaymentReminder[]> {
    try {
      const response = await api.get('/api/fees/payment-reminders/', params);
      return response.results || response;
    } catch (error) {
      console.error('Error fetching payment reminders:', error);
      throw error;
    }
  }

  /**
   * Get a single payment reminder by ID
   */
  async getPaymentReminder(id: number): Promise<PaymentReminder> {
    try {
      const response = await api.get(`/api/fees/payment-reminders/${id}/`);
      return response;
    } catch (error) {
      console.error(`Error fetching payment reminder ${id}:`, error);
      throw error;
    }
  }

  /**
   * Create a payment reminder
   */
  async createPaymentReminder(data: CreateReminderData): Promise<PaymentReminder> {
    try {
      const response = await api.post('/api/fees/payment-reminders/', data);
      return response;
    } catch (error) {
      console.error('Error creating payment reminder:', error);
      throw error;
    }
  }

  /**
   * Send bulk payment reminders
   */
  async sendBulkReminders(data: {
    student_ids: number[];
    reminder_type: string;
  }): Promise<any> {
    try {
      const response = await api.post('/api/fees/payment-reminders/send_bulk/', data);
      return response;
    } catch (error) {
      console.error('Error sending bulk reminders:', error);
      throw error;
    }
  }

  /**
   * Mark reminder as sent
   */
  async markReminderSent(id: number): Promise<any> {
    try {
      const response = await api.post(`/api/fees/payment-reminders/${id}/mark_sent/`, {});
      return response;
    } catch (error) {
      console.error(`Error marking reminder ${id} as sent:`, error);
      throw error;
    }
  }

  // ============================================================================
  // FINANCIAL REPORTS & ANALYTICS
  // ============================================================================

  /**
   * Generate fee report
   */
  async generateReport(data: FeeReportData): Promise<any> {
    try {
      const response = await api.post('/api/fees/reports/generate/', data);
      return response;
    } catch (error) {
      console.error('Error generating report:', error);
      throw error;
    }
  }

  /**
   * Export report as CSV
   */
  async exportReportCSV(data: FeeReportData): Promise<Blob> {
    try {
      const response = await fetch('/api/fees/reports/export_csv/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return response.blob();
    } catch (error) {
      console.error('Error exporting report CSV:', error);
      throw error;
    }
  }

  /**
   * Get fee summary statistics
   */
  async getFeeSummary(): Promise<FeeSummary> {
    try {
      const response = await api.get('/api/fees/reports/summary/');
      return response;
    } catch (error) {
      console.error('Error fetching fee summary:', error);
      throw error;
    }
  }

  /**
   * Get payment analytics
   */
  async getPaymentAnalytics(params?: {
    start_date?: string;
    end_date?: string;
    gateway?: string;
  }): Promise<any> {
    try {
      const response = await api.get('/api/fees/reports/payment_analytics/', params);
      return response;
    } catch (error) {
      console.error('Error fetching payment analytics:', error);
      throw error;
    }
  }

  /**
   * Get gateway performance metrics
   */
  async getGatewayPerformance(): Promise<any> {
    try {
      const response = await api.get('/api/fees/reports/gateway_performance/');
      return response;
    } catch (error) {
      console.error('Error fetching gateway performance:', error);
      throw error;
    }
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  /**
   * Download CSV export as a file
   */
  async downloadReportCSV(data: FeeReportData, filename: string = 'fee_report.csv'): Promise<void> {
    try {
      const blob = await this.exportReportCSV(data);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();

      setTimeout(() => {
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      }, 100);
    } catch (error) {
      console.error('Error downloading report CSV:', error);
      throw error;
    }
  }
}

export const feeService = new FeeService();
export default feeService;
