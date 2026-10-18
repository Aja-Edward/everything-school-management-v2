import React from 'react';

/**
 * Subjects whose papers carry a comprehension passage: English Language,
 * English Studies, Literature in English.
 */
export const hasPassages = (subjectName?: string | null): boolean =>
  /english|literature/i.test(subjectName || '');

interface Props {
  value: string;
  onChange: (text: string) => void;
  /** "Section A", "Section B": which section the passage goes with. */
  section: string;
}

/**
 * The box for a section's comprehension passage, kept apart from its
 * instructions. It prints in a frame above the section's questions, and in
 * CBT students can open it again on every question of the section.
 */
const SectionPassageField: React.FC<Props> = ({ value, onChange, section }) => (
  <div>
    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
      {section} Comprehension Passage
    </label>
    <p className="text-xs text-gray-500 dark:text-slate-400 mb-2">
      The passage this section's questions are about. Put each paragraph on its own line. Leave it empty if the
      section has none.
    </p>
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={Math.min(18, Math.max(4, Math.ceil(value.length / 90) + value.split('\n').length))}
      placeholder="Paste or type the passage here..."
      className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm leading-relaxed resize-y bg-white dark:bg-slate-700 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
    />
  </div>
);

export default SectionPassageField;
