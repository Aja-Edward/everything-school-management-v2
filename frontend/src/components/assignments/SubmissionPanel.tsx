import React, { useState } from 'react';
import { Loader2, MessageSquare, Send } from 'lucide-react';
import { toast } from 'react-toastify';
import { Badge } from '@/components/ui/badge';
import AttachmentLink from './AttachmentLink';
import AssignmentService, { Assignment, Submission, describeError } from '@/services/AssignmentService';

export const formatSubmittedAt = (iso: string): string =>
  new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });

/** Where a pupil stands on one assignment, as a badge or two. */
export const SubmissionBadges: React.FC<{ submission: Submission | null; overdue: boolean }> = ({ submission, overdue }) => {
  if (!submission) {
    return overdue
      ? <Badge variant="error" size="sm">Missing</Badge>
      : <Badge variant="default" size="sm">Not handed in</Badge>;
  }
  return (
    <span className="inline-flex flex-wrap gap-1.5">
      {submission.is_graded
        ? <Badge variant="primary" size="sm">Marked{submission.grade ? `: ${submission.grade}` : ''}</Badge>
        : <Badge variant="success" size="sm">Handed in</Badge>}
      {submission.is_late && <Badge variant="warning" size="sm">Late</Badge>}
    </span>
  );
};

/** The hand-in itself and, unless the reader is the one marking it, the teacher's mark. */
export const SubmissionDetails: React.FC<{ submission: Submission; showMark?: boolean }> = ({
  submission,
  showMark = true,
}) => (
  <div className="space-y-2">
    <p className="text-xs text-gray-500 dark:text-gray-400">
      Handed in {formatSubmittedAt(submission.submitted_at)}
      {submission.handed_in_by_parent && submission.submitted_by_name ? ` by ${submission.submitted_by_name} (parent)` : ''}
    </p>
    {submission.text && (
      <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-line break-words bg-gray-50 dark:bg-gray-900/40 rounded-md px-3 py-2">
        {submission.text}
      </p>
    )}
    {submission.attachment_url && (
      <AttachmentLink url={submission.attachment_url} name={submission.attachment_name} fallbackName="Submitted file" />
    )}
    {showMark && submission.is_graded && (
      <div className="rounded-md border border-blue-100 dark:border-blue-900/50 bg-blue-50 dark:bg-blue-900/20 px-3 py-2 text-sm">
        {submission.grade && (
          <p className="font-medium text-blue-900 dark:text-blue-200">Grade: {submission.grade}</p>
        )}
        {submission.feedback && (
          <p className="flex gap-1.5 text-blue-900/90 dark:text-blue-200/90 mt-1 whitespace-pre-line break-words">
            <MessageSquare className="w-4 h-4 shrink-0 mt-0.5" />
            {submission.feedback}
          </p>
        )}
        {submission.graded_by_name && (
          <p className="text-xs text-blue-800/70 dark:text-blue-300/70 mt-1">Marked by {submission.graded_by_name}</p>
        )}
      </div>
    )}
  </div>
);

/** For parents and admins: whether the child handed it in, and how it was marked. */
export const SubmissionStatus: React.FC<{ assignment: Assignment }> = ({ assignment }) => (
  <div className="space-y-2">
    <SubmissionBadges submission={assignment.submission} overdue={assignment.is_overdue} />
    {assignment.submission && <SubmissionDetails submission={assignment.submission} />}
  </div>
);

interface SubmitWorkProps {
  assignment: Assignment;
  onSaved: (submission: Submission) => void;
  /** Set when a parent hands in for a child; a student leaves it out. */
  child?: { id: number; name: string };
}

/**
 * Hand the work in, or change it until the teacher marks it: a student for
 * themself, or a parent for a child who can't log in on their own.
 */
export const SubmitWork: React.FC<SubmitWorkProps> = ({ assignment, onSaved, child }) => {
  const submission = assignment.submission;
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(submission?.text || '');
  const [file, setFile] = useState<File | null>(null);
  const [removeFile, setRemoveFile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = () => {
    setText(submission?.text || '');
    setFile(null);
    setRemoveFile(false);
    setError(null);
    setOpen(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const keepsFile = !!submission?.attachment_url && !removeFile;
    if (!text.trim() && !file && !keepsFile) {
      setError('Write an answer or attach a file before handing in.');
      return;
    }
    try {
      setSaving(true);
      setError(null);
      const saved = await AssignmentService.submit(assignment.id, {
        student: child?.id,
        text,
        attachment: file,
        remove_attachment: removeFile && !file,
      });
      onSaved(saved);
      setOpen(false);
      toast.success(
        submission
          ? (child ? `${child.name}'s hand-in was updated` : 'Your hand-in was updated')
          : (child ? `Handed in for ${child.name}. The teacher can now see it.` : 'Handed in. Your teacher can now see it.'),
      );
    } catch (err) {
      setError(describeError(err, 'The work could not be handed in. Please try again.'));
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SubmissionBadges submission={submission} overdue={assignment.is_overdue} />
          {!submission?.is_graded && (
            <button
              type="button"
              onClick={start}
              className={
                submission
                  ? 'text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline'
                  : 'inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700'
              }
            >
              {submission
                ? (child ? 'Change hand-in' : 'Change my hand-in')
                : <><Send className="w-4 h-4" /> {child ? `Hand in for ${child.name}` : 'Hand in work'}</>}
            </button>
          )}
        </div>
        {submission && <SubmissionDetails submission={submission} />}
        {!submission && assignment.is_overdue && (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            This is past its due date. It can still be handed in; the teacher will see it was late.
          </p>
        )}
      </div>
    );
  }

  const fieldId = `submit-${assignment.id}`;
  return (
    <form onSubmit={save} className="space-y-3">
      <div>
        <label htmlFor={`${fieldId}-text`} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          {child ? `${child.name}'s answer` : 'Your answer'}
        </label>
        <textarea
          id={`${fieldId}-text`}
          className="w-full min-h-[110px] rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={child ? 'Type the answer here, or attach a photo of the work below.' : 'Type your answer here, or attach your work below.'}
        />
      </div>
      <div>
        <label htmlFor={`${fieldId}-file`} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          {submission?.attachment_url ? 'Replace the file (optional)' : 'Attach a file (optional)'}
        </label>
        <input
          id={`${fieldId}-file`}
          type="file"
          accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.jpg,.jpeg,.png"
          className="block w-full text-sm text-gray-600 dark:text-gray-300 file:mr-3 file:rounded-md file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:text-blue-700 dark:file:bg-blue-900/40 dark:file:text-blue-300"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
        />
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          A photo of the work, or a PDF, Word, Excel or PowerPoint file, up to 10 MB.
        </p>
      </div>
      {submission?.attachment_url && !file && (
        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
          <input type="checkbox" checked={removeFile} onChange={(e) => setRemoveFile(e.target.checked)} />
          Remove {submission.attachment_name || 'the file'}
        </label>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/30 rounded-md px-3 py-2">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="px-3 py-1.5 text-sm rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          {submission ? 'Update hand-in' : child ? `Hand in for ${child.name}` : 'Hand in'}
        </button>
      </div>
    </form>
  );
};
