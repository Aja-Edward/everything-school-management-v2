// StudentOverrideDrawer.tsx
//
// Slide-over drawer for manually overriding a student's promotion status.
// All API work is handled by useManualOverride() — no api imports here.

import React, { useState } from "react";
import { useManualOverride } from "@/hooks/usePromotionThreshold";
import {
  StudentPromotion,
  PromotionStatus,
  ManualOverridePayload,
} from "@/types/student_promotions";

// ─── Types ────────────────────────────────────────────────────────────────────

interface StatusOption {
  value: Extract<PromotionStatus, "PROMOTED" | "HELD_BACK">;
  label: string;
  description: string;
  activeClass: string;
  inactiveClass: string;
  dot: string;
}

interface StudentOverrideDrawerProps {
  promotion: StudentPromotion;
  /** Numeric threshold passed down from the Dashboard via usePromotionThreshold. */
  threshold?: number;
  onSaved: (updated: StudentPromotion) => void;
  onClose: () => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_OPTIONS: StatusOption[] = [
  {
    value: "PROMOTED",
    label: "Promote",
    description: "Move this student to the next class",
    activeClass:
      "border-green-400 bg-green-50 text-green-800 ring-2 ring-green-300",
    inactiveClass:
      "border-gray-200 hover:border-green-300 hover:bg-green-50/50 text-gray-700",
    dot: "bg-green-500",
  },
  {
    value: "HELD_BACK",
    label: "Hold back",
    description: "Student stays in the same class next session",
    activeClass:
      "border-red-400 bg-red-50 text-red-800 ring-2 ring-red-300",
    inactiveClass:
      "border-gray-200 hover:border-red-300 hover:bg-red-50/50 text-gray-700",
    dot: "bg-red-500",
  },
];

const MIN_REASON_LENGTH = 10;

// ─── TermBar ──────────────────────────────────────────────────────────────────

interface TermBarProps {
  label: string;
  value?: string | null;
  threshold: number;
}

function TermBar({ label, value, threshold }: TermBarProps) {
  if (value === null || value === undefined) {
    return (
      <div className="flex items-center gap-3">
        <span className="text-xs text-gray-500 w-14">{label}</span>
        <span className="text-xs text-gray-400 italic">No result</span>
      </div>
    );
  }

  const pct     = Math.min(100, parseFloat(value));
  const passing = pct > threshold;

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-gray-500 w-14">{label}</span>
      <div className="flex-1 relative bg-gray-100 rounded-full h-2">
        <div
          className="absolute top-0 h-full w-0.5 bg-indigo-300 z-10"
          style={{ left: `${Math.min(threshold, 100)}%` }}
        />
        <div
          className={`h-2 rounded-full transition-all ${
            passing ? "bg-green-500" : "bg-red-400"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span
        className={`text-xs font-medium w-12 text-right ${
          passing ? "text-green-700" : "text-red-600"
        }`}
      >
        {pct.toFixed(1)}%
      </span>
    </div>
  );
}

// ─── StudentOverrideDrawer ────────────────────────────────────────────────────

export default function StudentOverrideDrawer({
  promotion,
  threshold = 49,
  onSaved,
  onClose,
}: StudentOverrideDrawerProps) {
  const { submit, saving, error: hookError } = useManualOverride();

  const [selectedStatus, setSelectedStatus] = useState<
    Extract<PromotionStatus, "PROMOTED" | "HELD_BACK"> | ""
  >(
    promotion.status === "PROMOTED" || promotion.status === "HELD_BACK"
      ? promotion.status
      : ""
  );
  const [reason, setReason]       = useState<string>(promotion.reason ?? "");
  const [localError, setLocalError] = useState<string | null>(null);

  // Resolve display name from either flat or nested field
  const studentName =
    promotion.student_name ?? promotion.student_detail?.full_name ?? "—";
  const admissionNumber =
    promotion.student_admission_number ??
    promotion.student_detail?.admission_number ??
    "";

  const sessionAvg =
    promotion.session_average != null
      ? parseFloat(promotion.session_average)
      : null;

  const displayError = localError ?? hookError;

  const handleSave = async () => {
    if (!selectedStatus) {
      setLocalError("Please choose Promote or Hold back");
      return;
    }
    if (!reason.trim() || reason.trim().length < MIN_REASON_LENGTH) {
      setLocalError(
        `Please provide a reason (at least ${MIN_REASON_LENGTH} characters)`
      );
      return;
    }

    setLocalError(null);

    const payload: ManualOverridePayload = {
      status: selectedStatus,
      reason: reason.trim(),
    };

    const updated = await submit(promotion.id, payload);
    if (updated) onSaved(updated);
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />

      <div className="fixed right-0 top-0 h-full z-50 w-full max-w-md bg-white shadow-2xl flex flex-col">

        {/* Header */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold text-gray-900">
              Manual override
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">{studentName}</p>
            {admissionNumber && (
              <p className="text-xs text-gray-400">{admissionNumber}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1 rounded"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

          {/* Term averages */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Term averages
              </h3>
              <span className="text-xs font-medium bg-indigo-50 border border-indigo-200 text-indigo-700 px-2 py-0.5 rounded-full">
                Threshold: {threshold}%
              </span>
            </div>

            <TermBar label="Term 1" value={promotion.term1_average} threshold={threshold} />
            <TermBar label="Term 2" value={promotion.term2_average} threshold={threshold} />
            <TermBar label="Term 3" value={promotion.term3_average} threshold={threshold} />

            <div className="mt-2 pt-3 border-t border-gray-100 flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">
                Session average
              </span>
              <span
                className={`text-sm font-semibold ${
                  sessionAvg !== null
                    ? sessionAvg > threshold
                      ? "text-green-700"
                      : "text-red-600"
                    : "text-gray-400"
                }`}
              >
                {sessionAvg !== null ? `${sessionAvg.toFixed(1)}%` : "—"}
              </span>
            </div>

            <p className="text-xs text-gray-400">
              Pass threshold: {threshold}%&nbsp;·&nbsp;
              {sessionAvg !== null
                ? sessionAvg > threshold
                  ? "Above threshold (would auto-promote)"
                  : "Below threshold (auto-flagged)"
                : "Incomplete results"}
            </p>
          </section>

          {/* Decision */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Decision
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {STATUS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setSelectedStatus(opt.value)}
                  className={`rounded-xl border px-4 py-3 text-left transition-all ${
                    selectedStatus === opt.value
                      ? opt.activeClass
                      : opt.inactiveClass
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`w-2 h-2 rounded-full ${opt.dot}`} />
                    <span className="text-sm font-medium">{opt.label}</span>
                  </div>
                  <p className="text-xs opacity-70">{opt.description}</p>
                </button>
              ))}
            </div>
          </section>

          {/* Reason */}
          <section className="space-y-2">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Reason <span className="text-red-400">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              placeholder="Describe why you are overriding the auto-promotion result…"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
            <p className="text-xs text-gray-400">
              {reason.trim().length} / {MIN_REASON_LENGTH} min characters
            </p>
          </section>

          {/* Previous manual decision */}
          {promotion.promotion_type === "MANUAL" && (
            <section className="bg-gray-50 rounded-lg p-3 text-xs text-gray-500 space-y-1">
              <p className="font-medium text-gray-700">
                Previous manual decision
              </p>
              <p>
                Status:{" "}
                <span className="capitalize">
                  {promotion.status.toLowerCase().replace("_", " ")}
                </span>
              </p>
              {promotion.processed_by_name && (
                <p>By: {promotion.processed_by_name}</p>
              )}
              {promotion.reason && <p>Reason: {promotion.reason}</p>}
            </section>
          )}

          {displayError && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">
              {displayError}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !selectedStatus}
            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
          >
            {saving ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Saving…
              </>
            ) : (
              "Save decision"
            )}
          </button>
        </div>
      </div>
    </>
  );
}