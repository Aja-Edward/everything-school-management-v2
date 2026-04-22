import React from 'react';
import { Download, Loader2, AlertCircle } from 'lucide-react';
import { useWeasyPrintPDF } from '@/hooks/useWeasyPrintPDF';
import { useAuthenticatedStudent } from '@/hooks/useAuthenticatedStudent'; // Extract this hook
import type { EducationLevel, TermType } from '@/services/WeasyPrintPDFService';

interface WeasyPrintResultDownloaderProps {
  reportId?: string;
  // Student info from parent
  studentId?: string;
  studentName: string;
  
  // Result selection info
  educationLevel: EducationLevel;
  examSessionId?: string;
  term?: TermType;
  session?: string;
  
  // UI customization
  variant?: 'button' | 'icon' | 'text';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  showStatus?: boolean;
  
  // Callbacks
  onSuccess?: () => void;
  onError?: (error: string) => void;
}

export const WeasyPrintResultDownloader: React.FC<WeasyPrintResultDownloaderProps> = ({
  reportId,
  studentId: propStudentId,
  studentName,
  educationLevel,
  examSessionId,
  term,
  session,
  variant = 'button',
  size = 'md',
  className = '',
  showStatus = true,
  onSuccess,
  onError
}) => {
  // ============================================================================
  // AUTHENTICATION - Use actual authenticated student ID
  // ============================================================================
  const { authenticatedStudentId, loading: authLoading } = useAuthenticatedStudent();
  
  // Use authenticated ID if available, fallback to prop
  const actualStudentId = authenticatedStudentId || propStudentId;

  // ============================================================================
  // WEASYPRINT HOOK
  // ============================================================================
  const {
    isGenerating,
    isDownloading,
    error,
    generateAndDownload,
    reset
  } = useWeasyPrintPDF({
    studentId: actualStudentId || '',
    studentName,
    educationLevel,
    examSessionId,
    term,
    session
  });

  // ============================================================================
  // HANDLERS
  // ============================================================================
  const handleDownload = async () => {
    if (!actualStudentId) {
      const errorMsg = 'Student authentication required';
      onError?.(errorMsg);
      console.error('❌ No authenticated student ID available');
      return;
    }

    if (!examSessionId) {
      const errorMsg = 'Exam session is required';
      onError?.(errorMsg);
      return;
    }

    try {
      await generateAndDownload();
      onSuccess?.();
    } catch (err: any) {
      onError?.(err.message || 'Download failed');
    }
  };

  // ============================================================================
  // LOADING STATE
  // ============================================================================
  if (authLoading) {
    return (
      <div className="flex items-center space-x-2 text-gray-500">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-sm">Authenticating...</span>
      </div>
    );
  }

  // ============================================================================
  // ERROR STATE
  // ============================================================================
  if (!actualStudentId) {
    return (
      <div className="flex items-center space-x-2 text-red-500">
        <AlertCircle className="w-4 h-4" />
        <span className="text-sm">Authentication required</span>
      </div>
    );
  }

  // ============================================================================
  // DISABLED STATE
  // ============================================================================
  const isDisabled = !examSessionId || isGenerating || isDownloading || authLoading;
  const isLoading = isGenerating || isDownloading;

  // ============================================================================
  // RENDER VARIANTS
  // ============================================================================
  const sizeClasses = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-base',
    lg: 'px-6 py-3 text-lg'
  };

  const iconSizes = {
    sm: 14,
    md: 16,
    lg: 20
  };

  // Button variant
  if (variant === 'button') {
    return (
      <div className="space-y-2">
        <button
          onClick={handleDownload}
          disabled={isDisabled}
          className={`
            flex items-center justify-center space-x-2
            bg-green-600 hover:bg-green-700 text-white
            rounded-lg font-medium transition-colors
            disabled:opacity-50 disabled:cursor-not-allowed
            ${sizeClasses[size]}
            ${className}
          `}
        >
          {isLoading ? (
            <>
              <Loader2 className="animate-spin" size={iconSizes[size]} />
              <span>{isGenerating ? 'Generating...' : 'Downloading...'}</span>
            </>
          ) : (
            <>
              <Download size={iconSizes[size]} />
              <span>Download PDF</span>
            </>
          )}
        </button>

        {showStatus && error && (
          <div className="flex items-center space-x-2 text-red-600 text-sm">
            <AlertCircle className="w-4 h-4" />
            <span>{error}</span>
          </div>
        )}
      </div>
    );
  }

  // Icon variant
  if (variant === 'icon') {
    return (
      <button
        onClick={handleDownload}
        disabled={isDisabled}
        className={`
          p-2 rounded-lg
          bg-green-600 hover:bg-green-700 text-white
          transition-colors
          disabled:opacity-50 disabled:cursor-not-allowed
          ${className}
        `}
        title="Download PDF"
      >
        {isLoading ? (
          <Loader2 className="animate-spin" size={iconSizes[size]} />
        ) : (
          <Download size={iconSizes[size]} />
        )}
      </button>
    );
  }

  // Text variant
  return (
    <button
      onClick={handleDownload}
      disabled={isDisabled}
      className={`
        flex items-center space-x-2
        text-green-600 hover:text-green-700
        transition-colors
        disabled:opacity-50 disabled:cursor-not-allowed
        ${className}
      `}
    >
      {isLoading ? (
        <>
          <Loader2 className="animate-spin" size={iconSizes[size]} />
          <span>{isGenerating ? 'Generating...' : 'Downloading...'}</span>
        </>
      ) : (
        <>
          <Download size={iconSizes[size]} />
          <span>Download PDF</span>
        </>
      )}
    </button>
  );
};

export default WeasyPrintResultDownloader;