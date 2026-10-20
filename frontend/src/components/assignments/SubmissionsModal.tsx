import React, { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { toast } from 'react-toastify';
import { SubmissionBadges, SubmissionDetails } from './SubmissionPanel';
import AssignmentService, { Assignment, ClassSubmissions, Submission, describeError } from '@/services/AssignmentService';

const inputClass =
  'w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 ' +
  'text-gray-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

interface MarkFormProps {
  assignmentId: number;
  submission: Submission;
  onMarked: (submission: Submission) => void;
}

const MarkForm: React.FC<MarkFormProps> = ({ assignmentId, submission, onMarked }) => {
  const [grade, setGrade] = useState(submission.grade);
  const [feedback, setFeedback] = useState(submission.feedback);
  const [saving, setSaving] = useState(false);

  const save = async (clear: boolean) => {
    if (clear && !window.confirm(`Hand this back to ${submission.student_name}? They'll be able to change it and hand it in again.`)) {
      return;
    }
    try {
      setSaving(true);
      const marked = await AssignmentService.grade(
        assignmentId, submission.id, clear ? '' : grade.trim(), clear ? '' : feedback.trim(),
      );
      if (clear) {
        setGrade('');
        setFeedback('');
      }
      onMarked(marked);
      toast.success(clear ? 'Handed back to the student' : 'Mark saved');
    } catch (err) {
      toast.error(describeError(err, 'The mark could not be saved'));
    } finally {
      setSaving(false);
    }
  };

  const id = `mark-${submission.id}`;
  return (
    <div className="mt-3 grid grid-cols-1 sm:grid-cols-[8rem_1fr] gap-2">
      <div>
        <label htmlFor={`${id}-grade`} className="sr-only">Grade</label>
        <input
          id={`${id}-grade`}
          className={inputClass}
          value={grade}
          maxLength={20}
          onChange={(e) => setGrade(e.target.value)}
          placeholder="Grade, e.g. 8/10"
        />
      </div>
      <div>
        <label htmlFor={`${id}-feedback`} className="sr-only">Feedback</label>
        <textarea
          id={`${id}-feedback`}
          className={`${inputClass} min-h-[38px]`}
          rows={1}
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          placeholder="Feedback for the student (optional)"
        />
      </div>
      <div className="sm:col-span-2 flex flex-wrap justify-end gap-2">
        {submission.is_graded && (
          <button
            type="button"
            onClick={() => save(true)}
            disabled={saving}
            className="px-3 py-1.5 text-sm rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-60"
          >
            Hand back to redo
          </button>
        )}
        <button
          type="button"
          onClick={() => save(false)}
          disabled={saving || (!grade.trim() && !feedback.trim())}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          {submission.is_graded ? 'Update mark' : 'Save mark'}
        </button>
      </div>
    </div>
  );
};

interface SubmissionsModalProps {
  assignment: Assignment;
  onClose: () => void;
}

/** The class list for one assignment: who has handed in, their work, and marking. */
const SubmissionsModal: React.FC<SubmissionsModalProps> = ({ assignment, onClose }) => {
  const [data, setData] = useState<ClassSubmissions | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    AssignmentService.submissions(assignment.id)
      .then(setData)
      .catch((err) => {
        console.error('Error fetching hand-ins:', err);
        setFailed(true);
      });
  }, [assignment.id]);

  const marked = (submission: Submission) =>
    setData((prev) => prev && {
      ...prev,
      students: prev.students.map((row) => (row.student_id === submission.student ? { ...row, submission } : row)),
    });

  const handedIn = data?.students.filter((row) => row.submission).length ?? 0;
  // Handed-in work first, unmarked before marked, so the teacher's to-do is on top.
  const rows = [...(data?.students || [])].sort((a, b) => {
    const rank = (s: Submission | null) => (!s ? 2 : s.is_graded ? 1 : 0);
    return rank(a.submission) - rank(b.submission);
  });

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/50 p-4 overflow-y-auto">
      <div className="w-full max-w-2xl rounded-xl bg-white dark:bg-gray-800 shadow-xl">
        <div className="flex items-start justify-between gap-3 p-5 border-b border-gray-200 dark:border-gray-700">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white break-words">{assignment.title}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {assignment.classroom_name}
              {data ? ` · ${handedIn} of ${data.students.length} handed in` : ''}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1 text-gray-500 hover:text-gray-800 dark:hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 max-h-[70vh] overflow-y-auto">
          {failed ? (
            <p className="text-center py-8 text-red-600 dark:text-red-400">The hand-ins could not be loaded.</p>
          ) : !data ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            </div>
          ) : rows.length === 0 ? (
            <p className="text-center py-8 text-gray-500 dark:text-gray-400">No students are enrolled in this class.</p>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-700">
              {!data.can_grade && (
                <li className="pb-3 text-xs text-gray-500 dark:text-gray-400">
                  Only the teacher who set this assignment, or the class teacher, can mark it.
                </li>
              )}
              {rows.map((row) => (
                <li key={row.student_id} className="py-4 first:pt-0">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <span className="font-medium text-gray-900 dark:text-white">{row.student_name}</span>
                    <SubmissionBadges submission={row.submission} overdue={assignment.is_overdue} />
                  </div>
                  {row.submission && (
                    <>
                      <SubmissionDetails submission={row.submission} showMark={!data.can_grade} />
                      {data.can_grade && (
                        <MarkForm
                          // Remount after a hand-back so the fields clear.
                          key={`${row.submission.id}-${row.submission.graded_at ?? 'open'}`}
                          assignmentId={assignment.id}
                          submission={row.submission}
                          onMarked={marked}
                        />
                      )}
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

export default SubmissionsModal;
