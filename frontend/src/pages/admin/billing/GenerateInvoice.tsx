/**
 * ============================================================================
 * GenerateInvoice.tsx
 * Page for generating new invoices for feature activation
 * ============================================================================
 */

import React, { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, Calendar, Users, FileText, Loader2, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { generateInvoice, getPricing, formatCurrency, getEnrolledStudentCount } from '@/services/BillingService';
import type { FeaturePricing, CreateInvoiceRequest, InvoiceGenerationResponse } from '@/types/types';
import { useNavigate } from 'react-router-dom';

// ============================================================================
// TYPES
// ============================================================================

interface SelectedFeature {
  feature_id: string;
  feature_name: string;
  price_per_student: number;
  selected: boolean;
}

interface InvoiceFormData {
  academic_session_id: string;
  term_id: string;
  student_count: number;
  due_date: string;
  notes: string;
  selected_features: string[];
}

// ============================================================================
// MOCK DATA (Replace with API calls in production)
// ============================================================================

const ACADEMIC_SESSIONS = [
  { id: '1', name: '2024/2025', is_current: false },
  { id: '2', name: '2025/2026', is_current: true },
  { id: '3', name: '2026/2027', is_current: false },
];

const TERMS = [
  { id: '1', name: 'First Term', session_id: '2' },
  { id: '2', name: 'Second Term', session_id: '2' },
  { id: '3', name: 'Third Term', session_id: '2' },
];

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * GenerateInvoice page for creating billing invoices
 */
export const GenerateInvoice: React.FC = () => {
  const navigate = useNavigate();

  // Form state
  const [formData, setFormData] = useState<InvoiceFormData>({
    academic_session_id: ACADEMIC_SESSIONS.find(s => s.is_current)?.id || '',
    term_id: '',
    student_count: 0,
    due_date: '',
    notes: '',
    selected_features: [],
  });

  // Features state
  const [features, setFeatures] = useState<SelectedFeature[]>([]);
  const [loadingFeatures, setLoadingFeatures] = useState(true);

  // Generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string>('');
  const [generationSuccess, setGenerationSuccess] = useState(false);
  const [generatedInvoice, setGeneratedInvoice] = useState<InvoiceGenerationResponse | null>(null);

  // Student count state
  const [loadingStudentCount, setLoadingStudentCount] = useState(false);

  // Load feature pricing on mount
  useEffect(() => {
    const loadPricing = async () => {
      setLoadingFeatures(true);
      try {
        const pricing = await getPricing();
        const mappedFeatures: SelectedFeature[] = pricing.map((p: FeaturePricing) => ({
          feature_id: p.feature_id,
          feature_name: p.feature_name,
          price_per_student: p.price_per_student,
          selected: false,
        }));
        setFeatures(mappedFeatures);
      } catch (error) {
        console.error('Failed to load pricing:', error);
        // Fallback to default features
        setFeatures([
          { feature_id: 'exams', feature_name: 'Exams & Results', price_per_student: 700, selected: false },
          { feature_id: 'attendance', feature_name: 'Attendance Tracking', price_per_student: 200, selected: false },
          { feature_id: 'messaging', feature_name: 'Messaging System', price_per_student: 150, selected: false },
        ]);
      } finally {
        setLoadingFeatures(false);
      }
    };

    loadPricing();
  }, []);

  // Load student count when session/term changes
  useEffect(() => {
    const loadStudentCount = async () => {
      if (!formData.academic_session_id || !formData.term_id) {
        return;
      }

      setLoadingStudentCount(true);
      try {
        const count = await getEnrolledStudentCount(formData.academic_session_id, formData.term_id);
        setFormData(prev => ({ ...prev, student_count: count }));
      } catch (error) {
        console.error('Failed to load student count:', error);
        setFormData(prev => ({ ...prev, student_count: 0 }));
      } finally {
        setLoadingStudentCount(false);
      }
    };

    loadStudentCount();
  }, [formData.academic_session_id, formData.term_id]);

  // Set default due date (30 days from today)
  useEffect(() => {
    const defaultDueDate = new Date();
    defaultDueDate.setDate(defaultDueDate.getDate() + 30);
    setFormData(prev => ({
      ...prev,
      due_date: defaultDueDate.toISOString().split('T')[0],
    }));
  }, []);

  // Calculate invoice totals
  const invoiceTotals = useMemo(() => {
    const selectedFeaturesList = features.filter(f => f.selected);
    const subtotal = selectedFeaturesList.reduce(
      (sum, f) => sum + (f.price_per_student * formData.student_count),
      0
    );
    const tax = 0; // No tax for now
    const total = subtotal + tax;

    return {
      subtotal,
      tax,
      total,
      selectedCount: selectedFeaturesList.length,
    };
  }, [features, formData.student_count]);

  // Handlers
  const handleFeatureToggle = (featureId: string) => {
    setFeatures(prev =>
      prev.map(f =>
        f.feature_id === featureId ? { ...f, selected: !f.selected } : f
      )
    );
  };

  const handleGenerate = async () => {
    // Validation
    if (!formData.academic_session_id) {
      setGenerationError('Please select an academic session');
      return;
    }

    if (!formData.term_id) {
      setGenerationError('Please select a term');
      return;
    }

    if (formData.student_count === 0) {
      setGenerationError('No enrolled students found for the selected session and term');
      return;
    }

    const selectedFeatures = features.filter(f => f.selected);
    if (selectedFeatures.length === 0) {
      setGenerationError('Please select at least one feature to activate');
      return;
    }

    if (!formData.due_date) {
      setGenerationError('Please set a due date');
      return;
    }

    setIsGenerating(true);
    setGenerationError('');

    try {
      // Prepare invoice data
      const invoiceData: CreateInvoiceRequest = {
        academic_session_id: formData.academic_session_id,
        term_id: formData.term_id,
        feature_ids: selectedFeatures.map(f => f.feature_id),
        due_date: formData.due_date,
        notes: formData.notes || undefined,
      };

      // Generate invoice
      const result = await generateInvoice(invoiceData);

      setGeneratedInvoice(result);
      setGenerationSuccess(true);

      // Navigate to invoice detail after a short delay
      setTimeout(() => {
        navigate(`/admin/billing/invoices/${result.invoice.id}`);
      }, 2000);
    } catch (error) {
      const err = error as Error;
      setGenerationError(err.message || 'Failed to generate invoice');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleBack = () => {
    navigate('/admin/billing');
  };

  // Get available terms for selected session
  const availableTerms = useMemo(() => {
    return TERMS.filter(t => t.session_id === formData.academic_session_id);
  }, [formData.academic_session_id]);

  // Success state
  if (generationSuccess && generatedInvoice) {
    return (
      <div className="container mx-auto p-6 max-w-2xl">
        <Card className="border-green-200 bg-green-50">
          <CardContent className="pt-6">
            <div className="text-center space-y-4">
              <div className="flex justify-center">
                <div className="bg-green-100 p-4 rounded-full">
                  <CheckCircle className="h-16 w-16 text-green-600" />
                </div>
              </div>
              <div>
                <h2 className="text-2xl font-bold text-green-900">Invoice Generated Successfully!</h2>
                <p className="text-green-700 mt-2">
                  Invoice {generatedInvoice.invoice.invoice_number} has been created.
                </p>
              </div>
              <div className="bg-white rounded-lg p-4 space-y-2 text-left">
                <div className="flex justify-between">
                  <span className="text-gray-600">Invoice Number:</span>
                  <span className="font-semibold">{generatedInvoice.invoice.invoice_number}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Total Amount:</span>
                  <span className="font-semibold text-lg">{formatCurrency(generatedInvoice.invoice.total)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Students:</span>
                  <span className="font-semibold">{generatedInvoice.invoice.student_count}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Due Date:</span>
                  <span className="font-semibold">
                    {new Date(generatedInvoice.invoice.due_date).toLocaleDateString()}
                  </span>
                </div>
              </div>
              <p className="text-sm text-green-700">
                Redirecting to invoice details...
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={handleBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Billing
        </Button>
      </div>

      <div>
        <h1 className="text-3xl font-bold text-gray-900">Generate Invoice</h1>
        <p className="text-gray-600 mt-1">
          Create a new invoice for feature activation
        </p>
      </div>

      {/* Error Alert */}
      {generationError && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <p className="text-red-800">{generationError}</p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Form - Left Column (2/3) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Session & Term Selection */}
          <Card>
            <CardHeader>
              <CardTitle>Academic Period</CardTitle>
              <CardDescription>Select the session and term for this invoice</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Academic Session */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Academic Session
                </label>
                <select
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={formData.academic_session_id}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    academic_session_id: e.target.value,
                    term_id: '', // Reset term when session changes
                  }))}
                >
                  <option value="">Select Session</option>
                  {ACADEMIC_SESSIONS.map(session => (
                    <option key={session.id} value={session.id}>
                      {session.name} {session.is_current && '(Current)'}
                    </option>
                  ))}
                </select>
              </div>

              {/* Term */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Term
                </label>
                <select
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={formData.term_id}
                  onChange={(e) => setFormData(prev => ({ ...prev, term_id: e.target.value }))}
                  disabled={!formData.academic_session_id}
                >
                  <option value="">Select Term</option>
                  {availableTerms.map(term => (
                    <option key={term.id} value={term.id}>
                      {term.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Student Count Display */}
              {formData.term_id && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Users className="h-5 w-5 text-blue-600" />
                      <span className="text-sm font-medium text-blue-900">Enrolled Students</span>
                    </div>
                    {loadingStudentCount ? (
                      <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                    ) : (
                      <span className="text-2xl font-bold text-blue-900">{formData.student_count}</span>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Feature Selection */}
          <Card>
            <CardHeader>
              <CardTitle>Features to Activate</CardTitle>
              <CardDescription>Select the features to include in this invoice</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingFeatures ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="hidden md:grid grid-cols-12 gap-4 text-sm font-semibold text-gray-700 pb-2 border-b">
                    <div className="col-span-5">Feature</div>
                    <div className="col-span-3 text-right">Per Student</div>
                    <div className="col-span-2 text-right">Students</div>
                    <div className="col-span-2 text-right">Amount</div>
                  </div>

                  {features.map(feature => {
                    const featureTotal = feature.price_per_student * formData.student_count;

                    return (
                      <div
                        key={feature.feature_id}
                        className={`grid grid-cols-1 md:grid-cols-12 gap-4 p-4 rounded-lg border-2 cursor-pointer transition-all ${
                          feature.selected
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                        onClick={() => handleFeatureToggle(feature.feature_id)}
                      >
                        <div className="md:col-span-5 flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={feature.selected}
                            onChange={() => handleFeatureToggle(feature.feature_id)}
                            className="h-5 w-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                            onClick={(e) => e.stopPropagation()}
                          />
                          <span className="font-medium text-gray-900">{feature.feature_name}</span>
                        </div>
                        <div className="md:col-span-3 md:text-right">
                          <span className="text-gray-600 md:hidden font-medium">Per Student: </span>
                          <span className="text-gray-900">{formatCurrency(feature.price_per_student)}</span>
                        </div>
                        <div className="md:col-span-2 md:text-right">
                          <span className="text-gray-600 md:hidden font-medium">Students: </span>
                          <span className="text-gray-700">{formData.student_count}</span>
                        </div>
                        <div className="md:col-span-2 md:text-right">
                          <span className="text-gray-600 md:hidden font-medium">Amount: </span>
                          <span className="font-semibold text-gray-900">{formatCurrency(featureTotal)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Additional Details */}
          <Card>
            <CardHeader>
              <CardTitle>Additional Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Due Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Calendar className="inline h-4 w-4 mr-1" />
                  Due Date
                </label>
                <Input
                  type="date"
                  value={formData.due_date}
                  onChange={(e) => setFormData(prev => ({ ...prev, due_date: e.target.value }))}
                  min={new Date().toISOString().split('T')[0]}
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <FileText className="inline h-4 w-4 mr-1" />
                  Notes (Optional)
                </label>
                <textarea
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={3}
                  placeholder="Add any notes or special instructions..."
                  value={formData.notes}
                  onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Summary - Right Column (1/3) */}
        <div className="lg:col-span-1">
          <Card className="sticky top-6">
            <CardHeader>
              <CardTitle>Invoice Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Selected Features Count */}
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Selected Features:</span>
                <span className="font-semibold">{invoiceTotals.selectedCount}</span>
              </div>

              {/* Student Count */}
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Students:</span>
                <span className="font-semibold">{formData.student_count}</span>
              </div>

              <div className="border-t pt-4 space-y-3">
                {/* Subtotal */}
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Subtotal:</span>
                  <span className="font-medium">{formatCurrency(invoiceTotals.subtotal)}</span>
                </div>

                {/* Tax */}
                {invoiceTotals.tax > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Tax:</span>
                    <span className="font-medium">{formatCurrency(invoiceTotals.tax)}</span>
                  </div>
                )}

                {/* Total */}
                <div className="flex justify-between items-center pt-3 border-t">
                  <span className="text-lg font-semibold text-gray-900">Total:</span>
                  <span className="text-2xl font-bold text-blue-600">
                    {formatCurrency(invoiceTotals.total)}
                  </span>
                </div>
              </div>

              {/* Generate Button */}
              <Button
                onClick={handleGenerate}
                disabled={isGenerating || invoiceTotals.selectedCount === 0 || formData.student_count === 0}
                className="w-full"
                size="lg"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <FileText className="mr-2 h-5 w-5" />
                    Generate Invoice
                  </>
                )}
              </Button>

              {/* Helper Text */}
              <p className="text-xs text-gray-500 text-center">
                Invoice will be generated and can be paid immediately
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default GenerateInvoice;
