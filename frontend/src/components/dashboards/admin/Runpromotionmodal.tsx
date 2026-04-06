// RunPromotionModal.tsx
//
// Confirmation modal that triggers auto-promotion for a class + session.
// All API work is handled by useAutoPromotion() — no api imports here.

import React from "react";
import { useAutoPromotion } from "@/hooks/usePromotionThreshold";
import {
  AcademicSession,
  ClassItem,
  AutoPromotionResult,
  PromotionSummary,
} from "@/types/student_promotions";

// ─── Types ────────────────────────────────────────────────────────────────────

interface RunPromotionModalProps {
  sessionId: string | number;
  classId: string | number;
  sessions: AcademicSession[];
  classes: ClassItem[];
  /** Numeric threshold passed down from the Dashboard via usePromotionThreshold. */
  threshold?: number;
  onSuccess: (result: AutoPromotionResult) => void;
  onClose: () => void;
}

interface StatProps {
  label: string;
  value: string | number;
  color: string;
}

// ─── Stat tile ────────────────────────────────────────────────────────────────

function Stat({ label, value, color }: StatProps) {
  return (
    <div className="bg-gray-50 rounded-lg p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-xl font-semibold mt-0.5 ${color}`}>{value}</p>
    </div>
  );
}

// ─── RunPromotionModal ────────────────────────────────────────────────────────

export default function RunPromotionModal({
  sessionId,
  classId,
  sessions,
  classes,
  threshold = 49,
  onSuccess,
  onClose,
}: RunPromotionModalProps) {
  const { run, running, error, result, reset } = useAutoPromotion();

  const sessionName =
    sessions.find((s) => String(s.id) === String(sessionId))?.name ??
    String(sessionId);
  const className =
    classes.find((c) => String(c.id) === String(classId))?.name ??
    String(classId);

  const handleRun = async () => {
    await run({
      academic_session_id: sessionId,
      student_class_id: classId,
    });
  };

  const handleDone = () => {
    if (result) {
      onSuccess(result);
    } else {
      onClose();
    }
  };

  const summary: PromotionSummary | undefined = result?.summary;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => e.target === e.currentTarget && !running && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden">

        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">
            Run auto-promotion
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            This will evaluate all students in{" "}
            <strong className="font-medium text-gray-700">{className}</strong>{" "}
            for{" "}
            <strong className="font-medium text-gray-700">{sessionName}</strong>.
          </p>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {!result ? (
            <>
              {/* Live rule summary */}
              <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-4 text-sm text-indigo-800 space-y-1">
                <div className="flex items-center justify-between">
                  <p className="font-medium">Promotion rule</p>
                  <span className="text-xs font-semibold bg-indigo-100 border border-indigo-200 px-2 py-0.5 rounded-full">
                    {threshold}% threshold
                  </span>
                </div>
                <p>
                  Students averaging{" "}
                  <strong>above {threshold}%</strong> across all three terms
                  will be automatically promoted.
                </p>
                <p>
                  Students at or below <strong>{threshold}%</strong> will be{" "}
                  <strong>flagged for review</strong> — you can then decide
                  individually whether to promote or hold them back.
                </p>
                <a
                  href="/settings/promotions"
                  className="text-xs text-indigo-600 hover:underline inline-block pt-1"
                >
                  Change threshold in settings →
                </a>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                Students with fewer than 3 published term results will be
                marked <strong>Pending</strong> and skipped.
              </div>

              {error && (
                <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">
                  {error}
                </p>
              )}
            </>
          ) : (
            <div className="space-y-3">
              <p className="text-sm font-medium text-gray-700">
                Promotion complete
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Stat
                  label="Promoted"
                  value={summary!.promoted}
                  color="text-green-700"
                />
                <Stat
                  label="Flagged for review"
                  value={summary!.flagged}
                  color="text-amber-700"
                />
                <Stat
                  label="Pending (incomplete)"
                  value={summary!.pending}
                  color="text-gray-500"
                />
                <Stat
                  label="Class average"
                  value={
                    summary!.class_average
                      ? `${parseFloat(summary!.class_average).toFixed(1)}%`
                      : "—"
                  }
                  color="text-indigo-700"
                />
              </div>

              {summary!.flagged > 0 && (
                <p className="text-xs text-amber-700 bg-amber-50 rounded p-2">
                  {summary!.flagged} student
                  {summary!.flagged !== 1 ? "s" : ""} need your review. Use
                  the Override button on each flagged student to decide.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
          {!result ? (
            <>
              <button
                onClick={onClose}
                disabled={running}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={handleRun}
                disabled={running}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
              >
                {running ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Running…
                  </>
                ) : (
                  "Run now"
                )}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => reset()}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900"
              >
                Run again
              </button>
              <button
                onClick={handleDone}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Done
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}