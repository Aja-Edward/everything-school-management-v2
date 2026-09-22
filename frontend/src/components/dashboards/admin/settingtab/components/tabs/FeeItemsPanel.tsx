import React, { useEffect, useState } from 'react';
import { Loader2, Pencil, Plus, Receipt, Send, X } from 'lucide-react';
import { toast } from 'react-toastify';
import api from '@/services/api';
import {
  FeeStructure,
  FeeStructureService,
  StudentFeeService,
} from '@/services/FeeManagementService';

const FEE_TYPES = [
  'TUITION', 'LIBRARY', 'LABORATORY', 'SPORTS', 'EXAM', 'DEVELOPMENT', 'TRANSPORT',
  'HOSTEL', 'UNIFORM', 'BOOKS', 'COMPUTER', 'MEDICAL', 'REGISTRATION', 'GRADUATION',
  'MISCELLANEOUS',
];
const FREQUENCIES = ['TERMLY', 'ANNUAL', 'MONTHLY', 'ONE_TIME'];
const TERMS = [
  { value: 'FIRST', label: 'First term' },
  { value: 'SECOND', label: 'Second term' },
  { value: 'THIRD', label: 'Third term' },
] as const;

const naira = (amount: string | number) =>
  `₦${Number(amount || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

const title = (value: string) =>
  value.replace(/_/g, ' ').toLowerCase().replace(/^./, c => c.toUpperCase());

interface SchoolClass {
  id: number;
  name: string;
  education_level?: number;
  education_level_id?: number;
}

interface Session {
  id: number;
  name: string;
  is_current?: boolean;
}

const rows = <T,>(data: any): T[] => (Array.isArray(data) ? data : data?.results ?? []);

const field = 'w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500';

// The fees a school charges its parents, and giving them to students for a
// term. The amounts here are the school's own; what the school pays Nuventa
// is the other card on this page.
const FeeItemsPanel: React.FC = () => {
  const [fees, setFees] = useState<FeeStructure[] | null>(null);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [editing, setEditing] = useState<Partial<FeeStructure> | null>(null);
  const [issuing, setIssuing] = useState<FeeStructure | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const data = await FeeStructureService.list({ page_size: 200 });
      setFees(rows<FeeStructure>(data));
    } catch (err) {
      console.error('Error loading fee items:', err);
      setFees([]);
      toast.error('Could not load the fee items.');
    }
  };

  useEffect(() => {
    load();
    api.get('/api/classrooms/classes/', { page_size: 200 })
      .then(data => setClasses(rows<SchoolClass>(data)))
      .catch(() => setClasses([]));
    api.get('/api/academics/sessions/', { page_size: 50 })
      .then(data => setSessions(rows<Session>(data)))
      .catch(() => setSessions([]));
  }, []);

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editing) return;
    const form = new FormData(event.currentTarget);
    const classId = Number(form.get('student_class'));
    const chosen = classes.find(c => c.id === classId);
    const body = {
      name: String(form.get('name') || '').trim(),
      fee_type: String(form.get('fee_type')),
      student_class: classId,
      education_level: chosen?.education_level ?? chosen?.education_level_id,
      amount: String(form.get('amount')),
      frequency: String(form.get('frequency')),
      description: String(form.get('description') || ''),
      is_active: form.get('is_active') === 'on',
    };
    if (!body.education_level) {
      toast.error('That class has no education level set.');
      return;
    }
    try {
      setSaving(true);
      if (editing.id) {
        await FeeStructureService.update(editing.id, body as Partial<FeeStructure>);
        toast.success('Fee item saved.');
      } else {
        await FeeStructureService.create(body as Partial<FeeStructure>);
        toast.success('Fee item added.');
      }
      setEditing(null);
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || err?.message || 'Could not save the fee item.');
    } finally {
      setSaving(false);
    }
  };

  const issue = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!issuing) return;
    const form = new FormData(event.currentTarget);
    const who = String(form.get('who'));
    try {
      setSaving(true);
      const result = await StudentFeeService.bulkGenerate({
        fee_structure_id: issuing.id,
        academic_session_id: Number(form.get('academic_session')),
        term: String(form.get('term')) as 'FIRST' | 'SECOND' | 'THIRD',
        due_date: String(form.get('due_date')),
        student_class_id: who === 'class' ? issuing.student_class : null,
        education_level_id: who === 'level' ? issuing.education_level : null,
      });
      const parts = [`${result.billed} student${result.billed === 1 ? '' : 's'} billed ${naira(result.amount_each)}`];
      if (result.already_had_it) parts.push(`${result.already_had_it} already had it`);
      if (result.students_with_sibling_discount) {
        parts.push(`${result.students_with_sibling_discount} got the sibling discount (${naira(result.sibling_discount_total)} off)`);
      }
      toast.success(parts.join(' · '));
      setIssuing(null);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || err?.message || 'Could not issue the fee.');
    } finally {
      setSaving(false);
    }
  };

  const currentSession = sessions.find(s => s.is_current) ?? sessions[0];

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 sm:p-8 shadow-sm border border-slate-200 dark:border-slate-700">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="flex items-start gap-3">
          <span className="w-9 h-9 rounded-lg bg-primary-50 dark:bg-primary-900/40 text-primary-600 dark:text-primary-300 flex items-center justify-center flex-shrink-0">
            <Receipt className="w-4 h-4" />
          </span>
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Fee items</h3>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
              What this school charges parents. Issue one to a class for a term and every
              student in it gets the bill; a family's second child pays 10% less tuition.
            </p>
          </div>
        </div>
        <button
          onClick={() => setEditing({})}
          className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Add fee
        </button>
      </div>

      {fees === null ? (
        <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 text-primary-600 animate-spin" /></div>
      ) : fees.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          No fee items yet. Add one, then issue it to a class for the term.
        </p>
      ) : (
        <ul className="rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
          {fees.map(fee => (
            <li key={fee.id} className="flex items-center gap-3 px-4 py-3.5">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium text-slate-900 dark:text-white">{fee.name}</p>
                  {!fee.is_active && (
                    <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-500">
                      Inactive
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  {[fee.fee_type_display || title(fee.fee_type), fee.student_class_name, fee.education_level_name]
                    .filter(Boolean).join(' · ')}
                </p>
              </div>
              <div className="flex-shrink-0 text-right">
                <p className="text-sm font-medium text-slate-900 dark:text-white">{naira(fee.amount)}</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {(fee.frequency_display || fee.frequency || '').toLowerCase()}
                </p>
              </div>
              <div className="flex-shrink-0 flex items-center gap-1">
                <button
                  onClick={() => setIssuing(fee)}
                  title="Issue to students"
                  className="p-2 rounded-lg text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/30 transition-colors"
                >
                  <Send className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setEditing(fee)}
                  title="Edit"
                  className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <Pencil className="w-4 h-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Add or edit a fee item */}
      {editing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <form onSubmit={save} className="bg-white dark:bg-slate-900 rounded-xl p-6 w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-base font-semibold text-slate-900 dark:text-white">
                {editing.id ? 'Edit fee item' : 'Add fee item'}
              </h4>
              <button type="button" onClick={() => setEditing(null)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <label className="block">
                <span className="text-sm text-slate-700 dark:text-slate-200">Name</span>
                <input name="name" defaultValue={editing.name ?? ''} required placeholder="Tuition" className={field} />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-sm text-slate-700 dark:text-slate-200">Type</span>
                  <select name="fee_type" defaultValue={editing.fee_type ?? 'TUITION'} className={field}>
                    {FEE_TYPES.map(type => <option key={type} value={type}>{title(type)}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="text-sm text-slate-700 dark:text-slate-200">Charged</span>
                  <select name="frequency" defaultValue={editing.frequency ?? 'TERMLY'} className={field}>
                    {FREQUENCIES.map(f => <option key={f} value={f}>{title(f)}</option>)}
                  </select>
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-sm text-slate-700 dark:text-slate-200">Class</span>
                  <select name="student_class" defaultValue={editing.student_class ?? ''} required className={field}>
                    <option value="" disabled>Choose a class</option>
                    {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="text-sm text-slate-700 dark:text-slate-200">Amount (₦)</span>
                  <input name="amount" type="number" min="0" step="0.01" required
                         defaultValue={editing.amount ? String(editing.amount) : ''} className={field} />
                </label>
              </div>
              <label className="block">
                <span className="text-sm text-slate-700 dark:text-slate-200">Note for parents (optional)</span>
                <input name="description" defaultValue={editing.description ?? ''} className={field} />
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" name="is_active" defaultChecked={editing.is_active ?? true}
                       className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500" />
                <span className="text-sm text-slate-700 dark:text-slate-200">In use</span>
              </label>
            </div>

            <div className="mt-5 flex gap-3">
              <button type="button" onClick={() => setEditing(null)}
                      className="flex-1 h-10 text-sm font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700">
                Cancel
              </button>
              <button type="submit" disabled={saving}
                      className="flex-1 h-10 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-60 rounded-lg inline-flex items-center justify-center gap-2">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                Save
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Issue a fee to students */}
      {issuing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <form onSubmit={issue} className="bg-white dark:bg-slate-900 rounded-xl p-6 w-full max-w-lg shadow-xl">
            <div className="flex items-center justify-between mb-1">
              <h4 className="text-base font-semibold text-slate-900 dark:text-white">
                Issue {issuing.name}
              </h4>
              <button type="button" onClick={() => setIssuing(null)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
              {naira(issuing.amount)} each. Students who already have this fee for the term are
              left alone, so you can issue again after new students join.
            </p>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-sm text-slate-700 dark:text-slate-200">Session</span>
                  <select name="academic_session" defaultValue={currentSession?.id} required className={field}>
                    {sessions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="text-sm text-slate-700 dark:text-slate-200">Term</span>
                  <select name="term" defaultValue="FIRST" className={field}>
                    {TERMS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </label>
              </div>
              <label className="block">
                <span className="text-sm text-slate-700 dark:text-slate-200">Due date</span>
                <input name="due_date" type="date" required className={field} />
              </label>
              <label className="block">
                <span className="text-sm text-slate-700 dark:text-slate-200">Who pays it</span>
                <select name="who" defaultValue="class" className={field}>
                  <option value="class">{issuing.student_class_name || 'This fee\'s class'}</option>
                  <option value="level">Everyone in {issuing.education_level_name || 'this level'}</option>
                  <option value="school">Every student in the school</option>
                </select>
              </label>
            </div>

            <div className="mt-5 flex gap-3">
              <button type="button" onClick={() => setIssuing(null)}
                      className="flex-1 h-10 text-sm font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700">
                Cancel
              </button>
              <button type="submit" disabled={saving}
                      className="flex-1 h-10 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-60 rounded-lg inline-flex items-center justify-center gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Issue
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default FeeItemsPanel;
