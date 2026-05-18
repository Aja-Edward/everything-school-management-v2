import React from 'react';
import { Eye, Printer, Download } from 'lucide-react';
import { useDesign } from '@/contexts/DesignContext';

interface ResultButtonsProps {
  onView: () => void;
  onPrint: () => void;
  onDownload: () => void;
  isPrinting: boolean;
  isDownloading: boolean;
}

const ResultButtons: React.FC<ResultButtonsProps> = ({
  onView,
  onPrint,
  onDownload,
  isPrinting,
  isDownloading,
}) => {
  const { settings } = useDesign();
  const primary = settings?.primary_color || '#4F46E5';

  return (
    <div className="flex flex-wrap justify-center gap-3">
      <button
        onClick={onView}
        className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
        style={{ background: primary }}
      >
        <Eye size={18} />
        View Result
      </button>

      <button
        onClick={onPrint}
        disabled={isPrinting}
        className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors"
        style={
          isPrinting
            ? { background: '#e5e7eb', color: '#9ca3af', cursor: 'not-allowed' }
            : { background: '#f3f4f6', color: '#374151' }
        }
      >
        <Printer size={18} />
        {isPrinting ? 'Printing...' : 'Print Result'}
      </button>

      <button
        onClick={onDownload}
        disabled={isDownloading}
        className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors border"
        style={
          isDownloading
            ? { borderColor: '#e5e7eb', color: '#9ca3af', cursor: 'not-allowed' }
            : { borderColor: primary, color: primary }
        }
      >
        <Download size={18} />
        {isDownloading ? 'Downloading...' : 'Download PDF'}
      </button>
    </div>
  );
};

export default ResultButtons;
