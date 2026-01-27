// components/QuestionSectionPractical.tsx
import React from "react";
import { RichTextEditor } from "@/components/shared/ExamEditor";
import { PracticalQuestion } from "@/types/types";



interface Props {
  value: PracticalQuestion[];
  onChange: (questions: PracticalQuestion[]) => void;
}

const emptyQuestion = (): PracticalQuestion => ({
  id: Date.now(),
  task: "",
  materials: "",
  expectedOutcome: "",
  marks: 1,
  timeLimit: "",
});

const QuestionSectionPractical: React.FC<Props> = ({ value, onChange }) => {
  const addQuestion = () => onChange([...value, emptyQuestion()]);
  const updateQuestion = <K extends keyof PracticalQuestion>(index: number, field: K, val: PracticalQuestion[K]) => {
    const updated = [...value];
    updated[index] = { ...updated[index], [field]: val } as PracticalQuestion;
    onChange(updated);
  };
  const removeQuestion = (index: number) => {
    const updated = [...value];
    updated.splice(index, 1);
    onChange(updated);
  };

  return (
    <div className="section-block">
      <h4>Practical Questions</h4>
      {value.map((q, i) => (
        <div className="practical-q-block" key={q.id}>
          <label>Task *</label>
          <RichTextEditor
            value={q.task}
            onChange={val => updateQuestion(i, "task", val)}
            placeholder="Enter task description..."
          />

          <label>Materials *</label>
          <RichTextEditor
            value={q.materials}
            onChange={val => updateQuestion(i, "materials", val)}
            placeholder="Enter required materials..."
          />

          <label>Expected Outcome *</label>
          <RichTextEditor
            value={q.expectedOutcome}
            onChange={val => updateQuestion(i, "expectedOutcome", val)}
            placeholder="Enter expected outcome..."
          />

          <label>Marks *</label>
          <input
            type="number"
            min="1"
            value={q.marks}
            onChange={e => updateQuestion(i, "marks", Number(e.target.value))}
          />

          <label>Time Limit</label>
          <input
            type="text"
            value={q.timeLimit || ""}
            onChange={e => updateQuestion(i, "timeLimit", e.target.value)}
            placeholder="e.g., 30 minutes"
          />

          <button type="button" onClick={() => removeQuestion(i)}>
            Remove Practical Question
          </button>
        </div>
      ))}
      <button type="button" onClick={addQuestion}>
        Add Practical Question
      </button>
    </div>
  );
};

export default QuestionSectionPractical;
