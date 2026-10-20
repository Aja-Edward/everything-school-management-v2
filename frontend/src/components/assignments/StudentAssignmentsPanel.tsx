import React, { useEffect, useState } from 'react';
import { ClipboardList, Loader2 } from 'lucide-react';
import { toast } from 'react-toastify';
import AssignmentCard from './AssignmentCard';
import { SubmissionStatus } from './SubmissionPanel';
import AssignmentService, { Assignment, describeError, sortForReading } from '@/services/AssignmentService';

interface StudentAssignmentsPanelProps {
  studentId: number;
  /** Cards to show before "Show all"; the admin views have little room. */
  limit?: number;
}

/**
 * One pupil's current-class assignments, for the admin's student page and
 * parent view. Admins may delete an assignment here but not edit it; editing
 * stays with the teacher who set it.
 */
const StudentAssignmentsPanel: React.FC<StudentAssignmentsPanelProps> = ({ studentId, limit = 3 }) => {
  const [assignments, setAssignments] = useState<Assignment[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setAssignments(null);
    setFailed(false);
    AssignmentService.list({ student: studentId })
      .then((rows) => { if (!cancelled) setAssignments(sortForReading(rows || [])); })
      .catch((error) => {
        console.error('Error fetching assignments:', error);
        if (!cancelled) setFailed(true);
      });
    return () => { cancelled = true; };
  }, [studentId]);

  const remove = async (a: Assignment) => {
    if (!window.confirm(`Delete "${a.title}" for the whole class? Parents and students will no longer see it.`)) return;
    try {
      await AssignmentService.remove(a.id);
      setAssignments((prev) => (prev || []).filter((x) => x.id !== a.id));
      toast.success('Assignment deleted');
    } catch (err) {
      toast.error(describeError(err, 'Could not delete the assignment'));
    }
  };

  if (failed) {
    return <p className="text-sm text-red-600 py-3">Assignments could not be loaded.</p>;
  }
  if (assignments === null) {
    return (
      <div className="flex justify-center py-4">
        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    );
  }
  if (assignments.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-400 py-3">
        <ClipboardList className="w-4 h-4" />
        No assignments for this student's class.
      </div>
    );
  }

  const overdue = assignments.filter((a) => a.is_overdue).length;
  const shown = showAll ? assignments : assignments.slice(0, limit);

  return (
    <div className="space-y-3 py-3">
      <p className="text-xs text-gray-500">
        {assignments.length - overdue} upcoming{overdue ? `, ${overdue} past due` : ''}
      </p>
      {shown.map((a) => (
        <AssignmentCard key={a.id} assignment={a} onDelete={remove}>
          <SubmissionStatus assignment={a} />
        </AssignmentCard>
      ))}
      {assignments.length > limit && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="text-sm font-medium text-blue-600 hover:underline"
        >
          {showAll ? 'Show fewer' : `Show all ${assignments.length}`}
        </button>
      )}
    </div>
  );
};

export default StudentAssignmentsPanel;
