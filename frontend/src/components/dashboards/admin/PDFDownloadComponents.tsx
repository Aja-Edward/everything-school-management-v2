import React, { useState } from 'react';
import { Download, FileDown, Loader } from 'lucide-react';
import { toast } from 'react-toastify';
import ResultService from '@/services/ResultService';
import weasyPrintService from '@/services/WeasyPrintPDFService';

/** Inline blob → browser download in case the service helper is missing */
const triggerDownload = (blob: Blob, filename: string) => {
  try {
    weasyPrintService.triggerBlobDownload(blob, filename);
  } catch {
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: filename });
    a.click();
    URL.revokeObjectURL(url);
  }
};

// ============================================
// PDF Download Button Component
// ============================================
interface PDFDownloadButtonProps {
  reportId: string;
  educationLevel: string;
  studentName: string;
  term: string;
  session: string;
  showStatus?: boolean; // ✅ ADD THIS
  onSuccess?: () => void;
  onError?: (error: any) => void;
  variant?: 'icon' | 'button' | 'text';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const PDFDownloadButton: React.FC<PDFDownloadButtonProps> = ({
  reportId,
  educationLevel,
  studentName,
  term,
  session,
  variant = 'icon',
  size = 'md',
  className = ''
}) => {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent row click when clicking download button
    
    if (!reportId) {
      toast.error('Report ID is missing');
      return;
    }

    try {
      setDownloading(true);
      
      // Show loading toast
      const loadingToast = toast.info('Preparing PDF download...', {
        autoClose: false
      });

      // Download the PDF
      const blob = await ResultService.downloadTermReportPDF(
        reportId,
        educationLevel.toUpperCase(),
        term
      );

      // Dismiss loading toast
      toast.dismiss(loadingToast);

      // Generate filename
      const sanitizedName = studentName.replace(/[^a-z0-9]/gi, '_');
      const sanitizedTerm = term.replace(/[^a-z0-9]/gi, '_');
      const sanitizedSession = session.replace(/[^a-z0-9]/gi, '_');
      const filename = `Report_${sanitizedName}_${sanitizedTerm}_${sanitizedSession}.pdf`;

      // Trigger download
      triggerDownload(blob, filename);

      toast.success('PDF downloaded successfully!');
    } catch (error: any) {
      console.error('PDF download error:', error);
      toast.error(error.message || 'Failed to download PDF');
    } finally {
      setDownloading(false);
    }
  };

  // Icon variant (for table actions)
  if (variant === 'icon') {
    const sizeClasses = {
      sm: 'w-3 h-3',
      md: 'w-4 h-4',
      lg: 'w-5 h-5'
    };

    return (
      <button
        onClick={handleDownload}
        disabled={downloading}
        className={`text-blue-600 hover:text-blue-900 p-1 rounded hover:bg-blue-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
        title="Download PDF Report"
      >
        {downloading ? (
          <Loader className={`${sizeClasses[size]} animate-spin`} />
        ) : (
          <Download className={sizeClasses[size]} />
        )}
      </button>
    );
  }

  // Text variant (for minimal display)
  if (variant === 'text') {
    return (
      <button
        onClick={handleDownload}
        disabled={downloading}
        className={`text-blue-600 hover:text-blue-800 underline text-sm disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      >
        {downloading ? 'Downloading...' : 'Download PDF'}
      </button>
    );
  }

  // Button variant (full button)
  const sizeClasses = {
    sm: 'px-2 py-1 text-xs',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-3 text-base'
  };

  return (
    <button
      onClick={handleDownload}
      disabled={downloading}
      className={`bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${sizeClasses[size]} ${className}`}
    >
      {downloading ? (
        <>
          <Loader className="w-4 h-4 animate-spin" />
          Downloading...
        </>
      ) : (
        <>
          <Download className="w-4 h-4" />
          Download PDF
        </>
      )}
    </button>
  );
};

// ============================================
// Bulk PDF Download Component
// ============================================
interface BulkPDFDownloadProps {
  selectedResults: any[];
  className?: string;
}

export const BulkPDFDownload: React.FC<BulkPDFDownloadProps> = ({
  selectedResults,
  className = ''
}) => {
  const [downloading, setDownloading] = useState(false);

  const handleBulkDownload = async () => {
    if (selectedResults.length === 0) {
      toast.warning('Please select results to download');
      return;
    }

    try {
      setDownloading(true);

      // Show loading toast
      const loadingToast = toast.info(
        `Preparing ZIP file with ${selectedResults.length} reports...`,
        { autoClose: false }
      );

      // Get the education level from first result (assuming all same level in bulk)
      const educationLevel = selectedResults[0].student?.education_level || 
                            selectedResults[0].education_level;

      // Extract report IDs
      const reportIds = selectedResults.map(r => r.id);

      // Download as ZIP
      const blob = await ResultService.bulkDownloadTermReports(
        reportIds,
        educationLevel
      );

      // Dismiss loading toast
      toast.dismiss(loadingToast);

      // Generate filename
      const timestamp = new Date().toISOString().split('T')[0];
      const filename = `Reports_Bulk_${timestamp}.zip`;

      // Trigger download
      triggerDownload(blob, filename);

      toast.success(`${selectedResults.length} reports downloaded successfully!`);
    } catch (error: any) {
      console.error('Bulk download error:', error);
      toast.error(error.message || 'Failed to download reports');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <button
      onClick={handleBulkDownload}
      disabled={downloading || selectedResults.length === 0}
      className={`px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
    >
      {downloading ? (
        <>
          <Loader className="w-4 h-4 animate-spin" />
          Downloading...
        </>
      ) : (
        <>
          <FileDown className="w-4 h-4" />
          Download Selected ({selectedResults.length})
        </>
      )}
    </button>
  );
};

// ============================================
// USAGE EXAMPLES FOR YOUR COMPONENT
// ============================================

/*
// 1. In the Table Actions Column (add after status actions):
<PDFDownloadButton
  reportId={result.id}
  educationLevel={result.student?.education_level || result.education_level}
  studentName={result.student?.full_name || 'Student'}
  term={result.term}
  session={result.academic_session?.name || 'Session'}
  variant="icon"
  size="md"
/>

// 2. In the Detail Modal (add in the header or actions section):
<PDFDownloadButton
  reportId={selectedStudent.id}
  educationLevel={selectedStudent.student?.education_level || selectedStudent.education_level}
  studentName={selectedStudent.student?.full_name || 'Student'}
  term={selectedStudent.term}
  session={selectedStudent.academic_session?.name || 'Session'}
  variant="button"
  size="md"
  className="ml-2"
/>

// 3. Bulk Download (add next to bulk status action buttons):
{selectedResults.length > 0 && (
  <BulkPDFDownload
    selectedResults={filteredResults.filter(r => selectedResults.includes(r.id))}
    className="ml-2"
  />
)}
*/