// PromotionDashboard.tsx
//
// All data-fetching, selection state, and filter logic live in
// usePromotionDashboard(). This file is pure render.
//
// Route suggestion: /promotions

import React, { useState } from "react";
import { Link } from "react-router-dom"
import {
  usePromotionDashboard,
  usePromotionThreshold,
} from "@/hooks/usePromotionThreshold";
import RunPromotionModal from "@/components/dashboards/admin/Runpromotionmodal";
import StudentOverrideDrawer from "@/components/dashboards/admin/StudentOverrideDrawer";
import {
  PromotionStatus,
  PromotionFilter,
  StudentPromotion,
  AutoPromotionResult,
} from "@/types/student_promotions";

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  PromotionStatus,
  { label: string; bg: string; text: string; border: string; dot: string }
> = {
  PROMOTED: {
    label: "Promoted",
    bg: "bg-green-50",
    text: "text-green-800",
    border: "border-green-200",
    dot: "bg-green-500",
  },
  HELD_BACK: {
    label: "Held back",
    bg: "bg-red-50",
    text: "text-red-800",
    border: "border-red-200",
    dot: "bg-red-500",
  },
  FLAGGED: {
    label: "Flagged",
    bg: "bg-amber-50",
    text: "text-amber-800",
    border: "border-amber-200",
    dot: "bg-amber-500",
  },
  PENDING: {
    label: "Pending",
    bg: "bg-gray-50",
    text: "text-gray-600",
    border: "border-gray-200",
    dot: "bg-gray-400",
  },
};

// ─── Small components ─────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: PromotionStatus }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.PENDING;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${cfg.bg} ${cfg.text} ${cfg.border}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

function Avg({ value, threshold }: { value?: string | null; threshold: number }) {
  if (value == null) return <span className="text-gray-400 text-sm">—</span>;
  const num = parseFloat(value);
  const color =
    num > threshold
      ? "text-green-700"
      : num > threshold * 0.85 // within 15% of threshold = borderline
      ? "text-amber-700"
      : "text-red-700";
  return (
    <span className={`text-sm font-medium ${color}`}>{num.toFixed(1)}%</span>
  );
}

function SummaryCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string | number | null | undefined;
  color: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col gap-1">
      <span className="text-xs text-gray-500 uppercase tracking-wide">
        {label}
      </span>
      <span className={`text-2xl font-semibold ${color}`}>{value ?? "—"}</span>
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  children,
  minWidth = "min-w-[180px]",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
  minWidth?: string;
}) {
  return (
    <div className={`flex flex-col gap-1 ${minWidth}`}>
      <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
      >
        {children}
      </select>
    </div>
  );
}

// ─── PromotionDashboard ───────────────────────────────────────────────────────

export default function PromotionDashboard() {
  const {
    sessions,
    classes,
    selectedSession,
    selectedClass,
    setSelectedSession,
    setSelectedClass,
    statusFilter,
    setStatusFilter,
    search,
    setSearch,
    filteredPromotions,
    summary,
    loading,
    error,
    applyAutoRunResult,
    applyOverrideResult,
    refreshSummary,
  } = usePromotionDashboard();

  // Threshold is derived from the selected class — same hook used everywhere
  const { threshold } = usePromotionThreshold(selectedClass, classes);

  // Modal / drawer visibility — purely local UI state, not data
  const [showRunModal,   setShowRunModal]   = useState(false);
  const [drawerStudent,  setDrawerStudent]  = useState<StudentPromotion | null>(null);

  const handleAutoRun = (result: AutoPromotionResult) => {
    applyAutoRunResult(result);
    setShowRunModal(false);
  };

  const handleOverrideSaved = async (updated: StudentPromotion) => {
    applyOverrideResult(updated);
    await refreshSummary();
    setDrawerStudent(null);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* ── Page header ── */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">
              Student promotion
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Students must average above{" "}
              <span className="font-medium text-gray-700">{threshold}%</span>{" "}
              across all three terms to be automatically promoted.{" "}
              <Link
                to="/admin/classroom-management/settings"
                className="text-indigo-600 hover:underline text-xs"
              >
                Edit threshold →
              </Link>
            </p>
          </div>
          <button
            onClick={() => setShowRunModal(true)}
            disabled={!selectedSession || !selectedClass}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
          >
            Run auto-promotion
          </button>
        </div>

        {/* ── Filters ── */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap gap-4">
          <SelectField
            label="Academic session"
            value={selectedSession}
            onChange={setSelectedSession}
            minWidth="min-w-[200px]"
          >
            <option value="">Select session…</option>
            {sessions.map((s) => (
              <option key={s.id} value={String(s.id)}>
                {s.name}
              </option>
            ))}
          </SelectField>

          <SelectField
            label="Class"
            value={selectedClass}
            onChange={setSelectedClass}
          >
            <option value="">Select class…</option>
            {classes.map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.name}
              </option>
            ))}
          </SelectField>

          <SelectField
            label="Status"
            value={statusFilter}
            onChange={(v) => setStatusFilter(v as PromotionFilter)}
            minWidth="min-w-[160px]"
          >
            <option value="ALL">All statuses</option>
            <option value="PROMOTED">Promoted</option>
            <option value="FLAGGED">Flagged</option>
            <option value="HELD_BACK">Held back</option>
            <option value="PENDING">Pending</option>
          </SelectField>

          <div className="flex flex-col gap-1 flex-1 min-w-[180px]">
            <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">
              Search
            </label>
            <input
              type="text"
              placeholder="Name or admission number…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        {/* ── Live threshold pill ── */}
        {selectedClass && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-500">Current pass threshold:</span>
            <span className="font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 rounded-full text-xs">
              {threshold}%
            </span>
            <a
              href="/settings/promotions"
              className="text-xs text-gray-400 hover:text-indigo-600"
            >
              Change in settings →
            </a>
          </div>
        )}

        {/* ── Summary cards ── */}
        {summary && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <SummaryCard label="Total"     value={summary.total}     color="text-gray-800" />
            <SummaryCard label="Promoted"  value={summary.promoted}  color="text-green-700" />
            <SummaryCard label="Flagged"   value={summary.flagged}   color="text-amber-700" />
            <SummaryCard label="Held back" value={summary.held_back} color="text-red-700" />
            <SummaryCard label="Pending"   value={summary.pending}   color="text-gray-500" />
            <SummaryCard
              label="Class avg"
              value={
                summary.class_average
                  ? `${parseFloat(summary.class_average).toFixed(1)}%`
                  : null
              }
              color="text-indigo-700"
            />
          </div>
        )}

        {/* ── Table ── */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
              Loading…
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-48 text-red-500 text-sm">
              {error}
            </div>
          ) : filteredPromotions.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
              {selectedSession && selectedClass
                ? "No promotion records found. Run auto-promotion to generate them."
                : "Select a session and class above to get started."}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="text-left   px-4 py-3 font-medium text-gray-600">Student</th>
                      <th className="text-center px-4 py-3 font-medium text-gray-600">Term 1</th>
                      <th className="text-center px-4 py-3 font-medium text-gray-600">Term 2</th>
                      <th className="text-center px-4 py-3 font-medium text-gray-600">Term 3</th>
                      <th className="text-center px-4 py-3 font-medium text-gray-600">Session avg</th>
                      <th className="text-center px-4 py-3 font-medium text-gray-600">Status</th>
                      <th className="text-center px-4 py-3 font-medium text-gray-600">Type</th>
                      <th className="text-right  px-4 py-3 font-medium text-gray-600">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filteredPromotions.map((promo) => {
                      const name = promo.student_name ?? promo.student_detail?.full_name ?? "—";
                      const adm  = promo.student_admission_number ?? promo.student_detail?.admission_number;
                      return (
                        <tr
                          key={promo.id}
                          className="hover:bg-gray-50 transition-colors"
                        >
                          <td className="px-4 py-3">
                            <div className="font-medium text-gray-900">{name}</div>
                            {adm && (
                              <div className="text-xs text-gray-400">{adm}</div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Avg value={promo.term1_average} threshold={threshold} />
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Avg value={promo.term2_average} threshold={threshold} />
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Avg value={promo.term3_average} threshold={threshold} />
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Avg value={promo.session_average} threshold={threshold} />
                            {promo.terms_counted < 3 && (
                              <div className="text-xs text-gray-400">
                                ({promo.terms_counted}/3 terms)
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <StatusBadge status={promo.status} />
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="text-xs text-gray-400">
                              {promo.promotion_type === "MANUAL"
                                ? "Manual"
                                : promo.promotion_type === "AUTO"
                                ? "Auto"
                                : "—"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => setDrawerStudent(promo)}
                              className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                            >
                              Override
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50 text-xs text-gray-400">
                Colour coding: green = above {threshold}%&nbsp;·&nbsp;
                amber = within 15% below threshold&nbsp;·&nbsp;
                red = significantly below threshold
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Modals ── */}
      {showRunModal && (
        <RunPromotionModal
          sessionId={selectedSession}
          classId={selectedClass}
          sessions={sessions}
          classes={classes}
          threshold={threshold}
          onSuccess={handleAutoRun}
          onClose={() => setShowRunModal(false)}
        />
      )}

      {drawerStudent && (
        <StudentOverrideDrawer
          promotion={drawerStudent}
          threshold={threshold}
          onSaved={handleOverrideSaved}
          onClose={() => setDrawerStudent(null)}
        />
      )}
    </div>
  );
}