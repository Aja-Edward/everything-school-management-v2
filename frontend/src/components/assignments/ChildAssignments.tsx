import React from 'react';
import { ClipboardList } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import AssignmentCard from './AssignmentCard';
import { Assignment, sortForReading } from '@/services/AssignmentService';

interface ChildAssignmentsProps {
  /** Shown in the heading, e.g. a child's name; omitted on a student's own dashboard. */
  whose?: string;
  classNames: string[];
  assignments: Assignment[];
  loading?: boolean;
  notEnrolledMessage: string;
}

/** The assignments of one pupil's current class, upcoming first. */
const ChildAssignments: React.FC<ChildAssignmentsProps> = ({
  whose,
  classNames,
  assignments,
  loading,
  notEnrolledMessage,
}) => {
  const sorted = sortForReading(assignments);
  const overdue = sorted.filter((a) => a.is_overdue).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ClipboardList className="w-5 h-5" />
          {whose ? `${whose}'s assignments` : 'Assignments'}
        </CardTitle>
        <CardDescription>
          {classNames.length > 0
            ? `${classNames.join(', ')} · ${sorted.length - overdue} upcoming${overdue ? `, ${overdue} past due` : ''}`
            : 'Not in a class yet'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-center py-8 text-gray-500 dark:text-gray-400">Loading assignments...</p>
        ) : classNames.length === 0 ? (
          <p className="text-center py-8 text-gray-500 dark:text-gray-400">{notEnrolledMessage}</p>
        ) : sorted.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            <ClipboardList className="w-12 h-12 mx-auto mb-3 text-gray-400" />
            <p>No assignments have been set for this class yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {sorted.map((a) => (
              <AssignmentCard key={a.id} assignment={a} showClass={classNames.length > 1} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ChildAssignments;
