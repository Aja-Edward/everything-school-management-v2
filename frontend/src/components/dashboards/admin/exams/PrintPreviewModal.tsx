import React, { useState, useEffect, useRef } from 'react';
import { X, Printer, Settings2, FileDown } from 'lucide-react';
import { Exam, PrintSettings, DEFAULT_PRINT_SETTINGS, downloadExamPdf } from '@/services/ExamService';
import { generateExamHtml } from '@/utils/examHtmlGenerator';
import { useSettings } from '@/contexts/SettingsContext';
import { normalizeExamDataForDisplay } from '@/utils/examDataNormalizer';

interface Props {
  open: boolean;
  exam?: Exam | null;
  onClose: () => void;
  /** Called when user saves updated print settings back to the exam */
  onSaveSettings?: (examId: number, ps: PrintSettings) => Promise<void>;
}

const PrintPreviewModal: React.FC<Props> = ({ open, exam, onClose, onSaveSettings }) => {
  const { settings } = useSettings();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const [copyType,     setCopyType]     = useState<'student' | 'teacher'>('student');
  const [printSettings, setPrintSettings] = useState<PrintSettings>({ ...DEFAULT_PRINT_SETTINGS });
  const [downloading,  setDownloading]  = useState(false);
  const [pdfError,     setPdfError]     = useState<string | null>(null);
  const [showPanel,    setShowPanel]    = useState(false);
  const [saving,       setSaving]       = useState(false);
  const [html,         setHtml]         = useState('');

  // Load print settings from exam when modal opens
  useEffect(() => {
    if (!open || !exam) return;
    setPrintSettings({ ...DEFAULT_PRINT_SETTINGS, ...(exam as any).print_settings });
    setCopyType('student');
  }, [open, exam]);

  // Re-generate HTML whenever exam, copyType or printSettings change
  useEffect(() => {
    if (!open || !exam) { setHtml(''); return; }
    const normalized = normalizeExamDataForDisplay(exam) ?? exam;
    const generated  = generateExamHtml(normalized as Exam, copyType, settings, printSettings);
    setHtml(generated);
  }, [open, exam, copyType, printSettings, settings]);

  // Inject HTML into iframe
  useEffect(() => {
    if (!iframeRef.current || !html) return;
    const doc = iframeRef.current.contentDocument;
    if (!doc) return;
    // Use srcdoc-equivalent via blob URL to avoid deprecated doc.write
    const blob = new Blob([html], { type: 'text/html' });
    const url  = URL.createObjectURL(blob);
    iframeRef.current.src = url;
    return () => URL.revokeObjectURL(url);
  }, [html]);

  const handlePrint = () => {
    iframeRef.current?.contentWindow?.print();
  };

  // Server-rendered PDF — same HTML as the preview, but with real pagination
  // and page numbers instead of whatever the browser's print dialog produces.
  const handleDownloadPdf = async () => {
    if (!exam?.id || !html) return;
    setPdfError(null);
    setDownloading(true);
    try {
      await downloadExamPdf(exam.id, html, copyType);
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : 'Could not download the PDF.');
    } finally {
      setDownloading(false);
    }
  };

  const handleSaveSettings = async () => {
    if (!exam?.id || !onSaveSettings) return;
    setSaving(true);
    try {
      await onSaveSettings(exam.id, printSettings);
    } finally {
      setSaving(false);
    }
  };

  if (!open || !exam) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-7xl h-[95vh] flex flex-col overflow-hidden">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-bold text-gray-900 dark:text-white truncate max-w-xs">
              {exam.title}
            </h2>
            {/* Copy type toggle */}
            <div className="flex bg-gray-100 rounded-lg p-0.5 gap-0.5">
              {(['student', 'teacher'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setCopyType(t)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium capitalize transition-colors ${
                    copyType === t
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {t === 'student' ? '👨‍🎓 Student Copy' : '👨‍🏫 Teacher Copy'}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowPanel(p => !p)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                showPanel
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}
            >
              <Settings2 size={13} />
              Format
            </button>
            {onSaveSettings && (
              <button
                onClick={handleSaveSettings}
                disabled={saving}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                {saving ? 'Saving…' : 'Save Format'}
              </button>
            )}
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              <Printer size={13} /> Print
            </button>
            <button
              onClick={handleDownloadPdf}
              disabled={downloading || !html}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              <FileDown size={13} /> {downloading ? 'Building PDF…' : 'Download PDF'}
            </button>
            <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors">
              <X size={18} />
            </button>
          </div>
        </div>

        {pdfError && (
          <div className="px-5 py-2 bg-red-50 border-b border-red-200 text-xs text-red-700 flex items-center justify-between flex-shrink-0">
            <span>{pdfError}</span>
            <button
              onClick={() => setPdfError(null)}
              className="text-red-500 hover:text-red-700"
              aria-label="Dismiss error"
            >
              <X size={14} />
            </button>
          </div>
        )}

        <div className="flex flex-1 overflow-hidden">
          {/* ── Format panel ── */}
          {showPanel && (
            <div className="w-72 border-r border-gray-200 overflow-y-auto flex-shrink-0 bg-gray-50 dark:bg-gray-800 p-4 space-y-4">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                <Settings2 size={14} /> Format Settings
              </h3>

              {/* Font family */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Font</label>
                <select
                  value={printSettings.font_family}
                  onChange={e => setPrintSettings(p => ({ ...p, font_family: e.target.value as any }))}
                  className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs bg-white"
                >
                  <option value="times_new_roman">Times New Roman</option>
                  <option value="arial">Arial</option>
                  <option value="georgia">Georgia</option>
                  <option value="calibri">Calibri</option>
                </select>
              </div>

              {/* Font size */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Font Size — {printSettings.font_size}pt
                </label>
                <input
                  type="range" min={10} max={14} step={1}
                  value={printSettings.font_size}
                  onChange={e => setPrintSettings(p => ({ ...p, font_size: Number(e.target.value) }))}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-gray-400 mt-0.5">
                  <span>10</span><span>12</span><span>14</span>
                </div>
              </div>

              {/* Line spacing */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Line Spacing</label>
                <div className="grid grid-cols-3 gap-1">
                  {([1.0, 1.5, 2.0] as const).map(v => (
                    <button
                      key={v}
                      onClick={() => setPrintSettings(p => ({ ...p, line_height: v }))}
                      className={`py-1.5 rounded border text-xs font-medium transition-colors ${
                        printSettings.line_height === v
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'border-gray-300 text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      {v === 1.0 ? 'Single' : v === 1.5 ? '1.5×' : 'Double'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Option layout */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">MCQ Options</label>
                <div className="space-y-1">
                  {([
                    { v: 'auto',    label: 'Auto (smart inline)' },
                    { v: 'inline',  label: 'Always inline' },
                    { v: 'stacked', label: 'Always stacked' },
                  ] as const).map(({ v, label }) => (
                    <button
                      key={v}
                      onClick={() => setPrintSettings(p => ({ ...p, option_layout: v }))}
                      className={`w-full py-1.5 px-2 rounded border text-xs font-medium text-left transition-colors ${
                        printSettings.option_layout === v
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'border-gray-300 text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {printSettings.option_layout === 'auto' && (
                  <p className="text-xs text-gray-400 mt-1">
                    Short questions: options inline. Long questions: options below.
                  </p>
                )}
              </div>

              {/* Column layout */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Columns</label>
                <div className="grid grid-cols-2 gap-1">
                  {([1, 2] as const).map(v => (
                    <button
                      key={v}
                      onClick={() => setPrintSettings(p => ({ ...p, column_layout: v }))}
                      className={`py-1.5 rounded border text-xs font-medium transition-colors ${
                        printSettings.column_layout === v
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'border-gray-300 text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      {v === 1 ? '1 Column' : '2 Columns'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Margins */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Margins</label>
                <div className="grid grid-cols-4 gap-1">
                  {([
                    ['tight',  '5mm'],
                    ['narrow', '13mm'],
                    ['normal', '25mm'],
                    ['wide',   '38mm'],
                  ] as const).map(([v, hint]) => (
                    <button
                      key={v}
                      onClick={() => setPrintSettings(p => ({ ...p, margin: v }))}
                      className={`py-1 rounded border text-xs font-medium capitalize transition-colors ${
                        printSettings.margin === v
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'border-gray-300 text-gray-600 hover:bg-gray-100'
                      }`}
                      title={`${v} — ${hint} on every side`}
                    >
                      {v}
                      <span className="block text-[10px] font-normal opacity-75">{hint}</span>
                    </button>
                  ))}
                </div>

                <button
                  onClick={() =>
                    setPrintSettings(p => ({
                      ...p,
                      margin: 'custom',
                      margin_mm: p.margin_mm ?? { top: 10, right: 10, bottom: 10, left: 10 },
                    }))
                  }
                  className={`w-full mt-1 py-1.5 rounded border text-xs font-medium transition-colors ${
                    printSettings.margin === 'custom'
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'border-gray-300 text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  Custom
                </button>

                {printSettings.margin === 'custom' && (
                  <div className="grid grid-cols-4 gap-1 mt-1">
                    {(['top', 'right', 'bottom', 'left'] as const).map(side => (
                      <label key={side} className="flex flex-col gap-0.5">
                        <span className="text-[10px] text-gray-500 capitalize">{side}</span>
                        <input
                          type="number"
                          min={5}
                          max={50}
                          value={printSettings.margin_mm?.[side] ?? 10}
                          onChange={e =>
                            setPrintSettings(p => ({
                              ...p,
                              margin_mm: {
                                top: 10, right: 10, bottom: 10, left: 10,
                                ...p.margin_mm,
                                [side]: Number(e.target.value),
                              },
                            }))
                          }
                          className="w-full border border-gray-300 rounded px-1.5 py-1 text-xs"
                        />
                      </label>
                    ))}
                  </div>
                )}

                <p className="text-xs text-gray-400 mt-1">
                  {printSettings.margin === 'custom'
                    ? 'Millimetres per side. Kept between 5 and 50 — most printers cannot print the outer few millimetres.'
                    : 'Tight is 5mm all round, tighter than the Narrow preset in Word. Normal is 1 inch.'}
                </p>
              </div>

              {/* Toggles */}
              {[
                { label: 'Show marks per question', key: 'show_marks' as const },
                { label: 'Show section instructions', key: 'show_instructions' as const },
              ].map(({ label, key }) => (
                <div key={key} className="flex items-center justify-between">
                  <span className="text-xs text-gray-600">{label}</span>
                  <button
                    onClick={() => setPrintSettings(p => ({ ...p, [key]: !p[key] }))}
                    className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ${
                      printSettings[key] ? 'bg-blue-600' : 'bg-gray-300'
                    }`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                      printSettings[key] ? 'translate-x-4' : ''
                    }`} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* ── Preview iframe ── */}
          <div className="flex-1 bg-gray-200 overflow-auto p-4">
            <div className="bg-white shadow-lg mx-auto" style={{ minHeight: '297mm' }}>
              <iframe
                ref={iframeRef}
                title="Exam Preview"
                className="w-full border-0"
                style={{ height: 'calc(95vh - 120px)', minHeight: '600px' }}
                sandbox="allow-same-origin allow-scripts"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PrintPreviewModal;
