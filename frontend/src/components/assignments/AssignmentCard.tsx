import React, { useState } from 'react';
import { CalendarDays, Download, Loader2, Paperclip, Pencil, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Assignment, formatDueDate, todayInLagos } from '@/services/AssignmentService';

const dueBadge = (assignment: Assignment) => {
  if (assignment.is_overdue) return <Badge variant="error" size="sm">Overdue</Badge>;
  if (assignment.due_date === todayInLagos()) return <Badge variant="warning" size="sm">Due today</Badge>;
  return <Badge variant="info" size="sm">Upcoming</Badge>;
};

interface AssignmentCardProps {
  assignment: Assignment;
  showClass?: boolean;
  onEdit?: (assignment: Assignment) => void;
  onDelete?: (assignment: Assignment) => void;
}

// Cloudinary stores the file under a random id, so a plain link would save
// it under that id. Fetching it lets us save it under the teacher's filename;
// if the fetch is blocked we fall back to opening the file.
const downloadAttachment = async (url: string, filename: string) => {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blobUrl = URL.createObjectURL(await response.blob());
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
};

/** One assignment as teachers, parents and students all read it. */
const AssignmentCard: React.FC<AssignmentCardProps> = ({ assignment, showClass = true, onEdit, onDelete }) => {
  const context = [
    showClass ? `${assignment.classroom_name}${assignment.section_name ? ` · ${assignment.section_name}` : ''}` : null,
    assignment.subject_name || 'General',
    assignment.teacher_name,
  ].filter(Boolean).join(' · ');
  const [downloading, setDownloading] = useState(false);

  const download = async () => {
    setDownloading(true);
    await downloadAttachment(assignment.attachment_url, assignment.attachment_name || 'assignment');
    setDownloading(false);
  };

  return (
    <div
      className={`rounded-lg border p-4 bg-white dark:bg-gray-800 ${
        assignment.is_overdue
          ? 'border-red-200 dark:border-red-900/60'
          : 'border-gray-200 dark:border-gray-700'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-gray-900 dark:text-white break-words">{assignment.title}</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{context}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {dueBadge(assignment)}
          {onEdit && assignment.can_edit && (
            <button
              type="button"
              onClick={() => onEdit(assignment)}
              className="p-1.5 rounded-md text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30"
              aria-label={`Edit ${assignment.title}`}
            >
              <Pencil className="w-4 h-4" />
            </button>
          )}
          {onDelete && assignment.can_edit && (
            <button
              type="button"
              onClick={() => onDelete(assignment)}
              className="p-1.5 rounded-md text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30"
              aria-label={`Delete ${assignment.title}`}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      <p className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-300 mt-3">
        <CalendarDays className="w-4 h-4 text-gray-400" />
        Due {formatDueDate(assignment.due_date)}
      </p>

      {assignment.instructions && (
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-2 whitespace-pre-line break-words">
          {assignment.instructions}
        </p>
      )}

      {assignment.attachment_url && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mt-3">
          <a
            href={assignment.attachment_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-blue-600 dark:text-blue-400 hover:underline break-all"
          >
            <Paperclip className="w-4 h-4 shrink-0" />
            {assignment.attachment_name || 'Attachment'}
          </a>
          <button
            type="button"
            onClick={download}
            disabled={downloading}
            className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {downloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            {downloading ? 'Downloading…' : 'Download'}
          </button>
        </div>
      )}
    </div>
  );
};

export default AssignmentCard;
