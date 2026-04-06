// PromotionSettingsPage.tsx
//
// School-level settings for promotion thresholds.
// All data-fetching and persistence is handled by usePromotionRules().
// This file contains only UI.
//
// Route suggestion: /settings/promotions

import React from "react";
import { usePromotionRules } from "@/hooks/usePromotionThreshold";
import { PromotionRuleRow } from "@/types/student_promotions";


// ─── Icons ────────────────────────────────────────────────────────────────────

function InfoIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  );
}

// ─── ThresholdVisual ──────────────────────────────────────────────────────────

function ThresholdVisual({ value }: { value: number }) {
  const pct = Math.min(Math.max(value, 0), 100);
  return (
    <div className="relative h-2 rounded-full bg-gray-100 overflow-hidden">
      <div
        className="absolute left-0 top-0 h-full bg-red-200 transition-all"
        style={{ width: `${pct}%` }}
      />
      <div
        className="absolute top-0 h-full bg-green-200 transition-all"
        style={{ left: `${pct}%`, right: 0 }}
      />
      <div
        className="absolute top-0 w-0.5 h-full bg-indigo-500 transition-all"
        style={{ left: `${pct}%` }}
      />
    </div>
  );
}

// ─── Toggle ───────────────────────────────────────────────────────────────────

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (val: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
        checked ? "bg-indigo-600" : "bg-gray-200"
      }`}
      role="switch"
      aria-checked={checked}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ${
          checked ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}

// ─── LevelCard ────────────────────────────────────────────────────────────────

const DEFAULT_THRESHOLD = 49;

const LEVEL_PILL_COLORS: Record<string, string> = {
  PRIMARY: "bg-teal-50 border-teal-200 text-teal-800",
  JUNIOR_SECONDARY: "bg-purple-50 border-purple-200 text-purple-800",
  SENIOR_SECONDARY: "bg-indigo-50 border-indigo-200 text-indigo-800",
};

function LevelCard({
  row,
  onUpdate,
}: {
  row: PromotionRuleRow;
  onUpdate: (
    levelId: string | number,
    field: keyof PromotionRuleRow,
    value: unknown
  ) => void;
}) {
  const { pass_threshold: threshold, dirty, level_type, education_level_id } = row;
  const numericThreshold = Number(threshold) || 0;  // ← add this

  const isDefault = threshold === DEFAULT_THRESHOLD;
  const pillClass =
    LEVEL_PILL_COLORS[level_type] ?? "bg-gray-100 border-gray-200 text-gray-700";

  const thresholdColor =
    numericThreshold > 60
      ? "text-green-600"
      : numericThreshold > 40
      ? "text-amber-600"
      : "text-red-500";




  return (
    <div
      className={`bg-white rounded-xl border ${
        dirty ? "border-indigo-300 shadow-sm" : "border-gray-200"
      } p-5 transition-all`}
    >
      <div className="flex items-start justify-between gap-4">
        {/* Left: level info + controls */}
        <div className="flex-1 space-y-4">
          {/* Header pills */}
          <div className="flex items-center gap-3">
            <span
              className={`text-xs font-medium px-2.5 py-0.5 rounded-full border ${pillClass}`}
            >
              {row.education_level_name}
            </span>
            {isDefault && (
              <span className="text-xs text-gray-400">Default (49%)</span>
            )}
            {dirty && (
              <span className="text-xs text-indigo-500 font-medium">
                Unsaved change
              </span>
            )}
          </div>

          {/* Threshold input + slider */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700">
                Pass threshold
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  value={numericThreshold}
                  onChange={(e) =>
                    onUpdate(education_level_id, "pass_threshold", parseFloat(e.target.value) || 0)
                  }
                  className="w-20 text-right border border-gray-300 rounded-lg px-2 py-1 text-sm font-medium text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <span className="text-sm text-gray-500">%</span>
              </div>
            </div>

            <input
              type="range"
              min="0"
              max="100"
              step="0.5"
              value={numericThreshold}
              onChange={(e) =>
                onUpdate(education_level_id, "pass_threshold", parseFloat(e.target.value))
              }
              className="w-full accent-indigo-600"
            />

            <ThresholdVisual value={numericThreshold} />

            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>Below {numericThreshold.toFixed(1)}% → flagged</span>
              <span>Above {numericThreshold.toFixed(1)}% → promoted</span>
            </div>
          </div>

          {/* Require all 3 terms toggle */}
          <div className="flex items-center justify-between pt-2 border-t border-gray-100">
            <div>
              <p className="text-sm font-medium text-gray-700">
                Require all three terms
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                When on, students with fewer than 3 published term results are
                skipped (marked Pending) instead of promoted on partial data.
              </p>
            </div>
            <Toggle
              checked={row.require_all_three_terms}
              onChange={(val) =>
                onUpdate(education_level_id, "require_all_three_terms", val)
              }
            />
          </div>
        </div>

        {/* Right: numeric summary */}
        <div className="hidden sm:flex flex-col items-center justify-center w-24 gap-1 shrink-0">
          <div className={`text-3xl font-bold tabular-nums ${thresholdColor}`}>
            {numericThreshold.toFixed(0)}
            <span className="text-base font-normal text-gray-400">%</span>
          </div>
          <p className="text-xs text-gray-400 text-center leading-tight">
            pass threshold
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── PromotionSettingsPage ────────────────────────────────────────────────────

export default function PromotionSettingsPage() {
  const { rows, loading, saving, error, savedAt, hasDirty, updateRow, saveAll } =
    usePromotionRules();

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-3xl mx-auto space-y-6">

        {/* Page header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">
              Promotion settings
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Set the minimum session average required for a student to be
              automatically promoted. Changes apply to the next auto-promotion
              run.
            </p>
          </div>

          <button
            onClick={saveAll}
            disabled={saving || !hasDirty}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
          >
            {saving ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Saving…
              </>
            ) : savedAt && !hasDirty ? (
              <>
                <CheckIcon />
                Saved
              </>
            ) : (
              "Save changes"
            )}
          </button>
        </div>

        {/* Info banner */}
        <div className="flex gap-3 bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-800">
          <span className="text-blue-400 mt-0.5 shrink-0">
            <InfoIcon />
          </span>
          <p>
            The <strong>session average</strong> is the mean of a student's
            average score across <strong>Term 1, Term 2, and Term 3</strong>.
            A student must score <em>above</em> the threshold to be automatically
            promoted. Students who fall at or below it are flagged for your
            manual review.
          </p>
        </div>

        {/* Settings cards */}
        {loading ? (
          <div className="flex items-center justify-center h-40 text-gray-400 text-sm">
            Loading…
          </div>
        ) : (
          <div className="space-y-4">
            {rows.map((row) => (
              <LevelCard
                key={row.education_level_id}
                row={row}
                onUpdate={updateRow}
              />
            ))}
          </div>
        )}

        {/* Error */}
        {error && (
          <p className="text-sm text-red-600 bg-red-50 rounded-xl p-4 border border-red-200">
            {error}
          </p>
        )}

        {/* Last saved timestamp */}
        {savedAt && !hasDirty && (
          <p className="text-xs text-gray-400 text-right">
            Last saved {savedAt.toLocaleTimeString()}
          </p>
        )}
      </div>
    </div>
  );
}