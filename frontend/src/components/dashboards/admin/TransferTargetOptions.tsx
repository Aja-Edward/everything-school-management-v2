import React from 'react';
import type { Classroom } from '@/types/classroomtypes';
import { classroomLabel } from '@/services/TeacherService';

interface TransferTargetOptionsProps {
  source: Classroom;
  targets: Classroom[];
}

const spotsText = (c: Classroom) =>
  c.is_full
    ? ' (Full)'
    : c.available_spots != null
      ? ` (${c.available_spots} spot${c.available_spots !== 1 ? 's' : ''})`
      : '';

// <option>s for a transfer destination picker. The other sections of the
// source's class come first, so moving a pupil from Primary 3 Gold to
// Primary 3 Silver is one obvious pick; every option names its section.
const TransferTargetOptions: React.FC<TransferTargetOptionsProps> = ({ source, targets }) => {
  const sameClass = targets.filter(
    (c) => c.class_grade != null && c.class_grade === source.class_grade,
  );
  const otherClasses = targets.filter((c) => !sameClass.includes(c));

  const option = (c: Classroom) => (
    <option key={c.id} value={c.id} disabled={c.is_full ?? false}>
      {classroomLabel(c)}
      {spotsText(c)}
    </option>
  );

  if (sameClass.length === 0) return <>{otherClasses.map(option)}</>;

  return (
    <>
      <optgroup label={`Other sections of ${source.class_name || source.name}`}>
        {sameClass.map(option)}
      </optgroup>
      {otherClasses.length > 0 && (
        <optgroup label="Other classes">{otherClasses.map(option)}</optgroup>
      )}
    </>
  );
};

export default TransferTargetOptions;
