// ApplyPromotionsModal.tsx
//
// Moves promoted students into the next class. Opens with a dry-run preview
// so the admin sees exactly who moves where before anything changes.
// All API work is handled by useApplyPromotions() — no api imports here.

import { useEffect, useState } from "react";
import { useApplyPromotions } from "@/hooks/usePromotionThreshold";
import { ApplyPromotionsResult } from "@/types/student_promotions";

interface ApplyPromotionsModalProps {
  sessionId: string | number;
  classId: string | number;
  sessionName: string;
  onApplied: () => void;
  onClose: () => void;
}

export default function ApplyPromotionsModal({
  sessionId,
  classId,
  sessionName,
  onApplied,
  onClose,
}: ApplyPromotionsModalProps) {
  const { preview, apply, working, error } = useApplyPromotions();
  const [plan, setPlan]       = useState<ApplyPromotionsResult | null>(null);
  const [applied, setApplied] = useState<ApplyPromotionsResult | null>(null);

  const payload = { academic_session_id: sessionId, student_class_id: classId };

  useEffect(() => {
    preview(payload).then(setPlan);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, classId]);

  const handleApply = async () => {
    const result = await apply(payload);
    if (result) setApplied(result);
  };

  const shown = applied ?? plan;
  const count = shown?.moved.length ?? 0;
  const unresolved = (shown?.remaining.flagged ?? 0) + (shown?.remaining.pending ?? 0);
  // The school's final class: promoted students leave rather than move up.
  const graduating = shown?.graduating ?? false;
  const students = `${count} student${count !== 1 ? "s" : ""}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => e.target === e.currentTarget && !working && (applied ? onApplied() : onClose())}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 overflow-hidden">

        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Apply promotions</h2>
          <p className="mt-1 text-sm text-gray-500">
            {graduating ? "Graduates" : "Moves"} every{" "}
            <strong className="font-medium text-gray-700">Promoted</strong> student
            {shown && (
              <>
                {" "}in <strong className="font-medium text-gray-700">{shown.from_class.name}</strong>{" "}
                ({sessionName})
                {shown.to_class && (
                  <>
                    {" "}into <strong className="font-medium text-gray-700">{shown.to_class.name}</strong>
                  </>
                )}
              </>
            )}
            .
          </p>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4 max-h-[60vh] overflow-y-auto">
          {working && !shown && (
            <p className="text-sm text-gray-400">Checking who will move…</p>
          )}

          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{error}</p>
          )}

          {shown && (
            <>
              {applied ? (
                <p className="text-sm text-green-800 bg-green-50 border border-green-200 rounded-lg p-3">
                  {graduating
                    ? `${students} graduated from ${applied.from_class.name}.`
                    : `${students} moved to ${applied.to_class?.name}.`}
                </p>
              ) : count === 0 ? (
                <p className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3">
                  No promoted students are waiting to {graduating ? "graduate" : "move"}. Run
                  auto-promotion or override flagged students first.
                </p>
              ) : (
                <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-4 text-sm text-indigo-800">
                  <p className="font-medium">
                    {graduating
                      ? `${students} will graduate`
                      : `${students} will move to ${shown.to_class?.name}`}
                  </p>
                  <ul className="mt-2 space-y-0.5 text-indigo-700">
                    {shown.moved.map((m) => (
                      <li key={m.student_id} className="flex justify-between gap-3">
                        <span>{m.student_name}</span>
                        {!graduating && (
                          <span className="text-xs text-indigo-500">
                            {m.section ? `Section ${m.section}` : "No section yet"}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {graduating && !applied && count > 0 && (
                <p className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded p-2">
                  {shown.from_class.name} is the last class, so there is no class to move them
                  into. Graduates are marked inactive — off class lists, attendance and fee runs —
                  but keep their records and can still log in to see past results.
                </p>
              )}

              {shown.skipped.length > 0 && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm text-gray-700">
                  <p className="font-medium">{graduating ? "Not graduated" : "Not moved"}</p>
                  <ul className="mt-1 space-y-0.5">
                    {shown.skipped.map((s) => (
                      <li key={s.student_id}>
                        {s.student_name} — <span className="text-gray-500">{s.reason}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {unresolved > 0 && (
                <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded p-2">
                  {shown.remaining.flagged} flagged and {shown.remaining.pending} pending student
                  {unresolved !== 1 ? "s" : ""} stay in {shown.from_class.name} for now. Once you
                  decide on them, apply promotions again — students already{" "}
                  {graduating ? "graduated" : "moved"} are not affected.
                </p>
              )}

              {!graduating && !applied && count > 0 && shown.moved.some((m) => !m.section) && (
                <p className="text-xs text-gray-500">
                  Students without a matching section in {shown.to_class?.name} will need one assigned.
                </p>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
          {applied ? (
            <button
              onClick={onApplied}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Done
            </button>
          ) : (
            <>
              <button
                onClick={onClose}
                disabled={working}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={handleApply}
                disabled={working || count === 0}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
              >
                {working && plan ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    {graduating ? "Graduating…" : "Moving…"}
                  </>
                ) : (
                  `${graduating ? "Graduate" : "Move"} ${students}`
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
