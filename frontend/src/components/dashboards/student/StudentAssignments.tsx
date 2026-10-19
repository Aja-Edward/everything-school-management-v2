import React, { useEffect, useState } from 'react';
import ChildAssignments from '@/components/assignments/ChildAssignments';
import AssignmentService, { Assignment } from '@/services/AssignmentService';

/** The student's own class's assignments; the API already limits the list to it. */
const StudentAssignments: React.FC = () => {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    AssignmentService.list()
      .then((rows) => setAssignments(rows || []))
      .catch((error) => {
        console.error('Error fetching assignments:', error);
        setFailed(true);
      })
      .finally(() => setLoading(false));
  }, []);

  if (failed) {
    return (
      <p className="text-center py-8 text-red-600 dark:text-red-400">
        Assignments could not be loaded. Please refresh the page.
      </p>
    );
  }

  const classNames = Array.from(new Set(assignments.map((a) => a.classroom_name)));

  return (
    <ChildAssignments
      // With nothing set yet there is no class name to show, but that is
      // not the same as not being in a class.
      classNames={classNames.length ? classNames : ['Your class']}
      assignments={assignments}
      loading={loading}
      notEnrolledMessage=""
    />
  );
};

export default StudentAssignments;
