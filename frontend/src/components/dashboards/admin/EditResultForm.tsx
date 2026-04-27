/**
 * EditResultForm.tsx
 *
 * Loads existing ComponentScore rows for the result, renders one input per
 * component (fetched from AssessmentComponent API), and submits via:
 *   POST /api/results/<level>/results/<id>/component-scores/
 *
 * For Nursery: edits mark_obtained + max_marks_obtainable directly.
 */

import React, { useState, useEffect } from 'react';
import { X, Save, RefreshCw, Target, AlertCircle } from 'lucide-react';
import { toast } from 'react-toastify';
import api from '@/services/api';
import ResultService from '@/services/ResultService';
import resultSettingsService, { AssessmentComponent } from '@/services/ResultSettingsService';
import type { EducationLevelType, AnySubjectResult, NurseryResult } from '@/services/ResultService';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface EditResultFormProps {
  /** The subject result object as returned by the API */
  result: AnySubjectResult & { education_level?: EducationLevelType };
  /** The education level — passed separately in case it's on the parent report */
  educationLevel: EducationLevelType;
  onClose: () => void;
  onSuccess: () => void;
}

function levelPath(level: EducationLevelType): string {
  const map: Record<EducationLevelType, string> = {
    NURSERY: 'nursery',
    PRIMARY: 'primary',
    JUNIOR_SECONDARY: 'junior-secondary',
    SENIOR_SECONDARY: 'senior-secondary',
  };
  return map[level];
}

function gradeFromPct(pct: number): string {
  if (pct >= 70) return 'A';
  if (pct >= 60) return 'B';
  if (pct >= 50) return 'C';
  if (pct >= 45) return 'D';
  if (pct >= 39) return 'E';
  return 'F';
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

const EditResultForm: React.FC<EditResultFormProps> = ({
  result,
  educationLevel,
  onClose,
  onSuccess,
}) => {
  const isNursery = educationLevel === 'NURSERY';
  const nurseryResult = result as unknown as NurseryResult;

  const [components, setComponents] = useState<AssessmentComponent[]>([]);
  const [componentScores, setComponentScores] = useState<Record<number, string>>({});
  const [teacherRemark, setTeacherRemark] = useState(
    (result as any).teacher_remark || (result as any).academic_comment || ''
  );
  const [markObtained, setMarkObtained] = useState(
    isNursery ? String(nurseryResult.mark_obtained || '0') : ''
  );
  const [maxMarks, setMaxMarks] = useState(
    isNursery ? String(nurseryResult.max_marks_obtainable || '100') : '100'
  );
  const [status, setStatus] = useState<'DRAFT' | 'APPROVED' | 'PUBLISHED'>(
    (result.status as any) || 'DRAFT'
  );

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // ── Load components + pre-fill existing scores ───────────────────────────
  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        if (!isNursery) {
          const comps = await resultSettingsService.getAssessmentComponents({
            education_level: educationLevelId(educationLevel),
            is_active: true,
          });
          const sorted = [...comps].sort((a, b) => a.display_order - b.display_order);
          setComponents(sorted);

          // Pre-fill from existing component_scores on the result
          const existing: Record<number, string> = {};
          const scores = (result as any).component_scores || [];
          scores.forEach((cs: any) => {
            existing[cs.component] = String(cs.score);
          });
          setComponentScores(existing);
        }
      } catch (e) {
        console.error('EditResultForm load error:', e);
        toast.error('Failed to load assessment components');
      } finally {
        setLoading(false);
      }
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Derived totals ───────────────────────────────────────────────────────
  const caComponents = components.filter((c) => c.contributes_to_ca);
  const examComponents = components.filter((c) => !c.contributes_to_ca);

  const caTotal = caComponents.reduce(
    (sum, c) => sum + (parseFloat(componentScores[c.id] || '0') || 0),
    0
  );
  const examTotal = examComponents.reduce(
    (sum, c) => sum + (parseFloat(componentScores[c.id] || '0') || 0),
    0
  );
  const totalScore = caTotal + examTotal;
  const maxPossible = components.reduce((sum, c) => sum + parseFloat(c.max_score), 0);
  const percentage = maxPossible > 0 ? (totalScore / maxPossible) * 100 : 0;

  const nurseryPct =
    parseFloat(maxMarks) > 0
      ? (parseFloat(markObtained || '0') / parseFloat(maxMarks)) * 100
      : 0;

  // ── Validation ───────────────────────────────────────────────────────────
  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (isNursery) {
      const mark = parseFloat(markObtained || '0');
      const max = parseFloat(maxMarks || '0');
      if (max <= 0) errs.maxMarks = 'Max marks must be greater than 0';
      if (mark < 0 || mark > max) errs.markObtained = `Must be 0–${max}`;
    } else {
      components.forEach((c) => {
        const score = parseFloat(componentScores[c.id] || '0');
        const max = parseFloat(c.max_score);
        if (score < 0 || score > max) {
          errs[`comp_${c.id}`] = `Max ${max}`;
        }
      });
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // ── Submit ───────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      const path = levelPath(educationLevel);

      if (isNursery) {
        await ResultService.updateSubjectResult(educationLevel, result.id, {
          mark_obtained: parseFloat(markObtained || '0'),
          max_marks_obtainable: parseFloat(maxMarks),
          academic_comment: teacherRemark,
          status,
        });
      } else {
        // 1. Update metadata (remark, status)
        await ResultService.updateSubjectResult(educationLevel, result.id, {
          teacher_remark: teacherRemark,
          status,
        });

        // 2. Submit component scores via dedicated endpoint
        if (components.length > 0) {
          const scores = components
            .filter((c) => componentScores[c.id] !== undefined)
            .map((c) => ({ component_id: c.id, score: componentScores[c.id] || '0' }));

          if (scores.length > 0) {
            await api.post(
              `/api/results/${path}/results/${result.id}/component-scores/`,
              { scores }
            );
          }
        }
      }

      toast.success('Result updated successfully!');
      onSuccess();
      onClose();
    } catch (err: any) {
      const msg =
        err?.response?.data?.error ||
        err?.response?.data?.detail ||
        err?.message ||
        'Failed to update result';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Edit Result</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              {(result as any).subject?.name || 'Subject'} ·{' '}
              {(result as any).student?.full_name || 'Student'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {loading ? (
            <div className="flex items-center gap-2 text-slate-500 py-8 justify-center">
              <RefreshCw className="w-5 h-5 animate-spin" />
              Loading assessment components…
            </div>
          ) : (
            <>
              {/* ── Scores ── */}
              <div className="bg-slate-50 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2 mb-4">
                  <Target className="w-4 h-4" /> Score Breakdown
                </h3>

                {isNursery ? (
                  <div className="grid grid-cols-2 gap-4">
                    <ScoreField
                      label="Max Marks Obtainable"
                      value={maxMarks}
                      onChange={setMaxMarks}
                      max={999}
                      error={errors.maxMarks}
                    />
                    <ScoreField
                      label="Mark Obtained"
                      value={markObtained}
                      onChange={setMarkObtained}
                      max={parseFloat(maxMarks) || 100}
                      error={errors.markObtained}
                    />
                    {markObtained && parseFloat(maxMarks) > 0 && (
                      <div className="col-span-2">
                        <ResultSummary
                          total={parseFloat(markObtained || '0')}
                          max={parseFloat(maxMarks)}
                          pct={nurseryPct}
                          grade={gradeFromPct(nurseryPct)}
                        />
                      </div>
                    )}
                  </div>
                ) : components.length === 0 ? (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-amber-800">
                      No assessment components are configured for this education level. Configure them in
                      Settings → Exams & Results → Assessment Components.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {caComponents.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                          Continuous Assessment
                        </p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                          {caComponents.map((c) => (
                            <ScoreField
                              key={c.id}
                              label={`${c.name} (max ${c.max_score})`}
                              value={componentScores[c.id] || ''}
                              onChange={(v) =>
                                setComponentScores((prev) => ({ ...prev, [c.id]: v }))
                              }
                              max={parseFloat(c.max_score)}
                              error={errors[`comp_${c.id}`]}
                            />
                          ))}
                        </div>
                        <p className="text-right text-xs text-slate-500 mt-1">
                          CA Total: <strong className="text-slate-900">{caTotal.toFixed(1)}</strong>
                        </p>
                      </div>
                    )}

                    {examComponents.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                          Examination
                        </p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                          {examComponents.map((c) => (
                            <ScoreField
                              key={c.id}
                              label={`${c.name} (max ${c.max_score})`}
                              value={componentScores[c.id] || ''}
                              onChange={(v) =>
                                setComponentScores((prev) => ({ ...prev, [c.id]: v }))
                              }
                              max={parseFloat(c.max_score)}
                              error={errors[`comp_${c.id}`]}
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    {totalScore > 0 && (
                      <ResultSummary
                        total={totalScore}
                        max={maxPossible}
                        pct={percentage}
                        grade={gradeFromPct(percentage)}
                      />
                    )}
                  </div>
                )}
              </div>

              {/* ── Remark + Status ── */}
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
                    {isNursery ? 'Academic Comment' : 'Teacher Remark'}
                  </label>
                  <textarea
                    value={teacherRemark}
                    onChange={(e) => setTeacherRemark(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm resize-none focus:ring-2 focus:ring-slate-900 focus:border-transparent outline-none"
                    placeholder="Enter remark…"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
                    Status
                  </label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as any)}
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm bg-white focus:ring-2 focus:ring-slate-900 outline-none"
                  >
                    <option value="DRAFT">Draft</option>
                    <option value="APPROVED">Approved</option>
                    <option value="PUBLISHED">Published</option>
                  </select>
                </div>
              </div>

              {/* ── Actions ── */}
              <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-2.5 rounded-xl text-sm font-medium border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {submitting ? (
                    <><RefreshCw className="w-4 h-4 animate-spin" /> Updating…</>
                  ) : (
                    <><Save className="w-4 h-4" /> Update Result</>
                  )}
                </button>
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Map level_type string → education_level id for API filter. Falls back to level_type string. */
function educationLevelId(level: EducationLevelType): string {
  // The API accepts the level_type string directly for filtering
  return level;
}

function ScoreField({
  label, value, onChange, max, error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  max: number;
  error?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
      <input
        type="number"
        min={0}
        max={max}
        step="0.01"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-slate-900 focus:border-transparent outline-none ${
          error ? 'border-red-400 bg-red-50' : 'border-slate-300'
        }`}
        placeholder={`0–${max}`}
      />
      {error && <p className="text-red-500 text-xs mt-0.5">{error}</p>}
    </div>
  );
}

function ResultSummary({
  total, max, pct, grade,
}: {
  total: number;
  max: number;
  pct: number;
  grade: string;
}) {
  const colors: Record<string, string> = {
    A: 'text-emerald-700 bg-emerald-50',
    B: 'text-blue-700 bg-blue-50',
    C: 'text-amber-700 bg-amber-50',
    D: 'text-orange-700 bg-orange-50',
    E: 'text-red-600 bg-red-50',
    F: 'text-red-800 bg-red-100',
  };
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between">
      <div>
        <p className="text-xs text-slate-500">Total</p>
        <p className="text-xl font-bold text-slate-900">
          {total.toFixed(1)}
          <span className="text-sm font-normal text-slate-400">/{max.toFixed(1)}</span>
        </p>
        <p className="text-xs text-slate-500">{pct.toFixed(1)}%</p>
      </div>
      <div className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold ${colors[grade] || 'text-slate-600 bg-slate-50'}`}>
        {grade}
      </div>
    </div>
  );
}

export default EditResultForm;