import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ClipboardList, Loader2, Plus, X } from 'lucide-react';
import { toast } from 'react-toastify';
import TeacherDashboardLayout from '@/components/layouts/TeacherDashboardLayout';
import AssignmentCard from '@/components/assignments/AssignmentCard';
import AssignmentService, {
  Assignment,
  AssignmentInput,
  TeachingOption,
  describeError,
  sortForReading,
  todayInLagos,
} from '@/services/AssignmentService';

const inputClass =
  'w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 ' +
  'text-gray-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
const labelClass = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1';

interface FormState {
  classroom: string;
  subject: string;
  title: string;
  instructions: string;
  due_date: string;
  attachment: File | null;
  remove_attachment: boolean;
}

const emptyForm = (classroom = ''): FormState => ({
  classroom,
  subject: '',
  title: '',
  instructions: '',
  due_date: '',
  attachment: null,
  remove_attachment: false,
});

interface AssignmentFormProps {
  options: TeachingOption[];
  editing: Assignment | null;
  defaultClassroom: string;
  onClose: () => void;
  onSaved: () => void;
}

const AssignmentForm: React.FC<AssignmentFormProps> = ({ options, editing, defaultClassroom, onClose, onSaved }) => {
  const [form, setForm] = useState<FormState>(() =>
    editing
      ? {
          classroom: String(editing.classroom),
          subject: editing.subject ? String(editing.subject) : '',
          title: editing.title,
          instructions: editing.instructions,
          due_date: editing.due_date,
          attachment: null,
          remove_attachment: false,
        }
      : emptyForm(defaultClassroom || (options.length === 1 ? String(options[0].id) : '')),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chosenClass = options.find((o) => String(o.id) === form.classroom);
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  // A subject teacher must name the subject; pick it for them when there is only one.
  useEffect(() => {
    if (!chosenClass || chosenClass.leads_class || form.subject) return;
    if (chosenClass.subjects.length === 1) set('subject', String(chosenClass.subjects[0].id));
  }, [chosenClass, form.subject]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.classroom || !form.title.trim() || !form.due_date) {
      setError('Choose a class, and give the assignment a title and a due date.');
      return;
    }
    const input: AssignmentInput = {
      classroom: Number(form.classroom),
      subject: form.subject ? Number(form.subject) : null,
      title: form.title.trim(),
      instructions: form.instructions,
      due_date: form.due_date,
      attachment: form.attachment,
      remove_attachment: form.remove_attachment && !form.attachment,
    };
    try {
      setSaving(true);
      if (editing) {
        await AssignmentService.update(editing.id, input);
        toast.success('Assignment updated');
      } else {
        await AssignmentService.create(input);
        toast.success('Assignment posted. Parents of the class can now see it.');
      }
      onSaved();
    } catch (err) {
      setError(describeError(err, 'The assignment could not be saved.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/50 p-4 overflow-y-auto">
      <form
        onSubmit={submit}
        className="w-full max-w-lg rounded-xl bg-white dark:bg-gray-800 shadow-xl p-5 sm:p-6 space-y-4"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {editing ? 'Edit assignment' : 'New assignment'}
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1 text-gray-500 hover:text-gray-800 dark:hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="as-class" className={labelClass}>Class</label>
            <select
              id="as-class"
              className={inputClass}
              value={form.classroom}
              onChange={(e) => setForm((prev) => ({ ...prev, classroom: e.target.value, subject: '' }))}
            >
              <option value="">Choose a class</option>
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}{o.section_name ? ` · ${o.section_name}` : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="as-subject" className={labelClass}>Subject</label>
            <select
              id="as-subject"
              className={inputClass}
              value={form.subject}
              onChange={(e) => set('subject', e.target.value)}
              disabled={!chosenClass}
            >
              <option value="">{chosenClass?.leads_class ? 'General (no subject)' : 'Choose a subject'}</option>
              {chosenClass?.subjects.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="as-title" className={labelClass}>Title</label>
          <input
            id="as-title"
            className={inputClass}
            value={form.title}
            maxLength={200}
            onChange={(e) => set('title', e.target.value)}
            placeholder="e.g. Fractions worksheet"
          />
        </div>

        <div>
          <label htmlFor="as-instructions" className={labelClass}>Instructions</label>
          <textarea
            id="as-instructions"
            className={`${inputClass} min-h-[110px]`}
            value={form.instructions}
            onChange={(e) => set('instructions', e.target.value)}
            placeholder="What should students do?"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="as-due" className={labelClass}>Due date</label>
            <input
              id="as-due"
              type="date"
              className={inputClass}
              value={form.due_date}
              min={editing ? undefined : todayInLagos()}
              onChange={(e) => set('due_date', e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="as-file" className={labelClass}>Attachment (optional)</label>
            <input
              id="as-file"
              type="file"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.jpg,.jpeg,.png"
              className="block w-full text-sm text-gray-600 dark:text-gray-300 file:mr-3 file:rounded-md file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:text-blue-700 dark:file:bg-blue-900/40 dark:file:text-blue-300"
              onChange={(e) => set('attachment', e.target.files?.[0] || null)}
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">PDF, Word, Excel, PowerPoint or image, up to 10 MB.</p>
          </div>
        </div>

        {editing?.attachment_url && !form.attachment && (
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={form.remove_attachment}
              onChange={(e) => set('remove_attachment', e.target.checked)}
            />
            Remove the current attachment ({editing.attachment_name || 'file'})
          </label>
        )}

        {error && (
          <p role="alert" className="text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/30 rounded-md px-3 py-2">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {editing ? 'Save changes' : 'Post assignment'}
          </button>
        </div>
      </form>
    </div>
  );
};

const TeacherAssignmentsPage: React.FC = () => {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [options, setOptions] = useState<TeachingOption[]>([]);
  const [classFilter, setClassFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Assignment | null>(null);

  const load = useCallback(async () => {
    try {
      const [list, opts] = await Promise.all([
        AssignmentService.list(),
        AssignmentService.teachingOptions(),
      ]);
      setAssignments(list || []);
      setOptions(opts || []);
    } catch (err) {
      toast.error(describeError(err, 'Could not load assignments'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const shown = useMemo(
    () => sortForReading(classFilter ? assignments.filter((a) => String(a.classroom) === classFilter) : assignments),
    [assignments, classFilter],
  );

  const openNew = () => { setEditing(null); setFormOpen(true); };
  const openEdit = (a: Assignment) => { setEditing(a); setFormOpen(true); };

  const remove = async (a: Assignment) => {
    if (!window.confirm(`Delete "${a.title}"? Parents and students will no longer see it.`)) return;
    try {
      await AssignmentService.remove(a.id);
      setAssignments((prev) => prev.filter((x) => x.id !== a.id));
      toast.success('Assignment deleted');
    } catch (err) {
      toast.error(describeError(err, 'Could not delete the assignment'));
    }
  };

  return (
    <TeacherDashboardLayout>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Assignments</h1>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Work you set shows on the dashboards of the class's students and their parents.
            </p>
          </div>
          <button
            type="button"
            onClick={openNew}
            disabled={options.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            <Plus className="w-4 h-4" /> New assignment
          </button>
        </div>

        {options.length > 1 && (
          <div className="mb-4 max-w-xs">
            <label htmlFor="as-filter" className="sr-only">Filter by class</label>
            <select id="as-filter" className={inputClass} value={classFilter} onChange={(e) => setClassFilter(e.target.value)}>
              <option value="">All my classes</option>
              {options.map((o) => (
                <option key={o.id} value={o.id}>{o.name}{o.section_name ? ` · ${o.section_name}` : ''}</option>
              ))}
            </select>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          </div>
        ) : options.length === 0 && assignments.length === 0 ? (
          <div className="text-center py-16 text-gray-500 dark:text-gray-400">
            <ClipboardList className="w-12 h-12 mx-auto mb-3 text-gray-400" />
            <p>You aren't assigned to any class yet, so there's nowhere to set work.</p>
            <p className="text-sm mt-1">Ask the school admin to add you to a class.</p>
          </div>
        ) : shown.length === 0 ? (
          <div className="text-center py-16 text-gray-500 dark:text-gray-400">
            <ClipboardList className="w-12 h-12 mx-auto mb-3 text-gray-400" />
            <p>No assignments yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {shown.map((a) => (
              <AssignmentCard key={a.id} assignment={a} onEdit={openEdit} onDelete={remove} />
            ))}
          </div>
        )}
      </div>

      {formOpen && (
        <AssignmentForm
          options={options}
          editing={editing}
          defaultClassroom={classFilter}
          onClose={() => setFormOpen(false)}
          onSaved={() => { setFormOpen(false); load(); }}
        />
      )}
    </TeacherDashboardLayout>
  );
};

export default TeacherAssignmentsPage;
