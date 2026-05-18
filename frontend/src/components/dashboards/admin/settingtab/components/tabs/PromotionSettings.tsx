
import { usePromotionRules } from "@/hooks/usePromotionThreshold";
import { PromotionRuleRow, EditableRuleField } from "@/types/student_promotions";


// ─── Icons ────────────────────────────────────────────────────────────────────

function InfoIcon() {
  return (
    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  );
}

// ─── ThresholdVisual ──────────────────────────────────────────────────────────
// Black bar = fail zone, light gray bar = pass zone, dark divider = threshold

function ThresholdVisual({ value }: { value: number }) {
  const pct = Math.min(Math.max(value, 0), 100);
  return (
    <div className="relative h-2 rounded-full bg-gray-100 overflow-hidden">
      <div
        className="absolute left-0 top-0 h-full bg-gray-900 transition-all"
        style={{ width: `${pct}%` }}
      />
      <div
        className="absolute top-0 h-full bg-gray-200 transition-all"
        style={{ left: `${pct}%`, right: 0 }}
      />
    </div>
  );
}

// ─── Toggle ───────────────────────────────────────────────────────────────────

function Toggle({ checked, onChange }: { checked: boolean; onChange: (val: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2 ${
        checked ? "bg-black" : "bg-gray-200"
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

// Ordinal label map so we can show a subtle positional badge without color
const LEVEL_ORDER: Record<string, string> = {
  NURSERY:           "01",
  PRIMARY:           "02",
  JUNIOR_SECONDARY:  "03",
  SENIOR_SECONDARY:  "04",
};

function LevelCard({
  row,
  onUpdate,
}: {
  row: PromotionRuleRow;
  onUpdate: (levelId: string | number, field: EditableRuleField, value: unknown) => void;
}) {
  const { pass_threshold: threshold, dirty, level_type, education_level_id } = row;
  const numericThreshold = Number(threshold) || 0;
  const isDefault = threshold === DEFAULT_THRESHOLD;
  const ordinal = LEVEL_ORDER[level_type];

  return (
    <div className={`bg-white rounded-xl border transition-all ${
      dirty ? "border-black shadow-sm" : "border-gray-200"
    }`}>
      {/* Card header */}
      <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2.5 min-w-0">
          {ordinal && (
            <span className="text-xs font-mono text-gray-400 shrink-0">{ordinal}</span>
          )}
          <span className="text-sm font-semibold text-gray-900 truncate">
            {row.education_level_name}
          </span>
          {isDefault && !dirty && (
            <span className="text-xs text-gray-400 shrink-0">default</span>
          )}
        </div>
        {dirty && (
          <span className="text-xs font-semibold text-gray-900 bg-gray-100 px-2 py-0.5 rounded-full shrink-0 ml-2">
            Unsaved
          </span>
        )}
      </div>

      {/* Card body */}
      <div className="px-4 sm:px-5 py-4 flex items-start gap-4 sm:gap-6">
        {/* Left: controls */}
        <div className="flex-1 space-y-4 min-w-0">
          {/* Threshold row */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
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
                  className="w-16 text-right border border-gray-300 rounded-lg px-2 py-1 text-sm font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-black"
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
              className="w-full accent-black h-1.5 cursor-pointer"
            />

            <ThresholdVisual value={numericThreshold} />

            <div className="flex justify-between text-xs text-gray-400">
              <span>Below {numericThreshold.toFixed(1)}% → flagged</span>
              <span>Above {numericThreshold.toFixed(1)}% → promoted</span>
            </div>
          </div>

          {/* Require all 3 terms toggle */}
          <div className="flex items-start justify-between gap-4 pt-3 border-t border-gray-100">
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900">Require all three terms</p>
              <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                When on, students with fewer than 3 published term results are
                skipped (marked Pending) instead of being promoted on partial data.
              </p>
            </div>
            <Toggle
              checked={row.require_all_three_terms}
              onChange={(val) => onUpdate(education_level_id, "require_all_three_terms", val)}
            />
          </div>
        </div>

        {/* Right: large percentage readout */}
        <div className="hidden sm:flex flex-col items-center justify-center w-20 gap-0.5 shrink-0 pt-1">
          <span className="text-4xl font-bold tabular-nums text-gray-900 leading-none">
            {numericThreshold.toFixed(0)}
          </span>
          <span className="text-sm text-gray-400">%</span>
          <span className="text-[10px] text-gray-400 text-center leading-tight mt-1">
            pass<br/>threshold
          </span>
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
    <div className="bg-gray-50 min-h-screen p-4 sm:p-6">
      <div className="max-w-2xl mx-auto space-y-5">

        {/* ── Page header ── */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div>
              <h1 className="text-lg font-bold text-gray-900">Promotion Settings</h1>
              <p className="mt-1 text-sm text-gray-500 max-w-sm">
                Set the minimum session average required for a student to be
                automatically promoted. Changes apply to the next auto-promotion run.
              </p>
            </div>
            <button
              onClick={saveAll}
              disabled={saving || !hasDirty}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-black hover:bg-gray-800 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors self-start shrink-0"
            >
              {saving ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Saving…
                </>
              ) : savedAt && !hasDirty ? (
                <><CheckIcon />Saved</>
              ) : (
                "Save changes"
              )}
            </button>
          </div>

          {/* Info banner */}
          <div className="mt-4 flex gap-2.5 bg-gray-50 border border-gray-200 rounded-lg p-3.5 text-sm text-gray-700">
            <span className="text-gray-500 mt-0.5 shrink-0"><InfoIcon /></span>
            <p className="leading-relaxed">
              The <strong>session average</strong> is the mean of a student's score across{" "}
              <strong>Term 1, Term 2, and Term 3</strong>. A student must score{" "}
              <em>above</em> the threshold to be automatically promoted. Students who
              fall at or below it are flagged for manual review.
            </p>
          </div>
        </div>

        {/* ── Level cards ── */}
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="flex flex-col items-center gap-3 text-gray-400">
              <span className="w-7 h-7 border-2 border-gray-300 border-t-black rounded-full animate-spin" />
              <span className="text-sm">Loading settings…</span>
            </div>
          </div>
        ) : rows.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
            <p className="text-sm text-gray-500">No education levels found.</p>
            <p className="text-xs text-gray-400 mt-1">
              Create education levels in the Academic Settings first.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {rows.map((row) => (
              <LevelCard key={row.education_level_id} row={row} onUpdate={updateRow} />
            ))}
          </div>
        )}

        {/* ── Error ── */}
        {error && (
          <div className="flex items-start gap-2.5 bg-white border border-gray-300 rounded-xl p-4 text-sm text-gray-900">
            <span className="text-gray-600 mt-0.5 shrink-0"><InfoIcon /></span>
            <p>{error}</p>
          </div>
        )}

        {/* ── Last saved ── */}
        {savedAt && !hasDirty && (
          <p className="text-xs text-gray-400 text-right">
            Last saved {savedAt.toLocaleTimeString()}
          </p>
        )}

      </div>
    </div>
  );
}