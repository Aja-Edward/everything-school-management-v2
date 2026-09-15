/**
 * Files that carry a CBT paper to a school's exam station and its results back:
 * saving and reading them, and printing students' PIN slips.
 */

import type { CBTOfflineResults, CBTPinSlip } from '@/services/CBTService';

/** Small enough to stay well under a proxy's 1 MB request limit, even with long typed answers. */
export const RESULTS_BATCH_SIZE = 20;

export const saveJsonFile = (filename: string, data: unknown) => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const readJsonFile = async (file: File): Promise<unknown> => {
  try {
    return JSON.parse(await file.text());
  } catch {
    throw new Error(`${file.name} isn't a file this system made. Choose the .json file the exam station saved.`);
  }
};

export const isResultsFile = (data: unknown): data is CBTOfflineResults =>
  !!data && typeof data === 'object' && (data as CBTOfflineResults).format === 'cbt-offline-results'
  && Array.isArray((data as CBTOfflineResults).attempts);

/** The results file split into files of a few attempts each, for sending one at a time. */
export const resultBatches = (results: CBTOfflineResults, size = RESULTS_BATCH_SIZE): CBTOfflineResults[] => {
  const batches: CBTOfflineResults[] = [];
  for (let i = 0; i < results.attempts.length; i += size) {
    batches.push({ ...results, attempts: results.attempts.slice(i, i + size) });
  }
  return batches;
};

const escape = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

/** Opens the slips, two across and never split over a page, with the print dialog. Returns false if a pop-up blocker stopped it. */
export const printPinSlips = (examTitle: string, subject: string, slips: CBTPinSlip[]): boolean => {
  const page = window.open('', '_blank', 'width=900,height=700');
  if (!page) return false;
  const cards = slips.map((slip) => `
    <div class="slip">
      <div class="exam">${escape(examTitle)}${subject ? ` · ${escape(subject)}` : ''}</div>
      <div class="name">${escape(slip.name)}</div>
      <div class="meta">${escape([slip.registration_number, slip.class].filter(Boolean).join(' · '))}</div>
      <div class="codes">
        <div><span>Slip number</span><strong>${slip.number}</strong></div>
        <div><span>PIN</span><strong class="pin">${escape(slip.pin)}</strong></div>
      </div>
      <div class="note">Sign in at the exam station with your slip number and PIN. Keep your PIN to yourself.</div>
    </div>`).join('');
  page.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>PIN slips: ${escape(examTitle)}</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; padding: 12mm; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; color: #0f172a; }
      .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6mm; }
      .slip { border: 1.5px dashed #64748b; border-radius: 3mm; padding: 5mm; break-inside: avoid; page-break-inside: avoid; }
      .exam { font-size: 9pt; color: #475569; }
      .name { margin-top: 2mm; font-size: 13pt; font-weight: 700; }
      .meta { font-size: 9pt; color: #475569; min-height: 11pt; }
      .codes { display: flex; gap: 8mm; margin-top: 3mm; }
      .codes span { display: block; font-size: 8pt; text-transform: uppercase; letter-spacing: .05em; color: #64748b; }
      .codes strong { font-size: 18pt; font-variant-numeric: tabular-nums; }
      .pin { letter-spacing: .12em; }
      .note { margin-top: 3mm; font-size: 8pt; color: #64748b; }
      @media print { body { padding: 8mm; } }
    </style></head><body><div class="grid">${cards}</div>
    <script>window.onload = function () { window.print(); };<\/script></body></html>`);
  page.document.close();
  return true;
};
