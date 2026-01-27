// components/QuestionSectionObjectives.tsx
import React from "react";
import { RichTextEditor } from "@/components/shared/ExamEditor";
import { ObjectiveQuestion } from "@/types/types";



interface Props {
  value: ObjectiveQuestion[];
  onChange: (questions: ObjectiveQuestion[]) => void;
}

const emptyQuestion = (): ObjectiveQuestion => ({
  id: Date.now(),
  question: "",
  optionA: "",
  optionB: "",
  optionC: "",
  optionD: "",
  correctAnswer: "",
  marks: 1,
});

const QuestionSectionObjectives: React.FC<Props> = ({ value, onChange }) => {
  const addQuestion = () => onChange([...value, emptyQuestion()]);
  const updateQuestion = (index: number, field: keyof ObjectiveQuestion, val: ObjectiveQuestion[keyof ObjectiveQuestion]) => {
    const updated = [...value];
    updated[index] = { ...updated[index], [field]: val } as ObjectiveQuestion;
    onChange(updated);
  };
  const removeQuestion = (index: number) => {
    const updated = [...value];
    updated.splice(index, 1);
    onChange(updated);
  };

  return (
    <div className="section-block">
      <h4>Objective Questions</h4>
      {value.map((q, i) => (
        <div className="objective-q-block" key={q.id}>
          <label>Question *</label>
          <RichTextEditor
            value={q.question}
            onChange={val => updateQuestion(i, "question", val)}
            placeholder="Enter question text..."
          />

          <label>Option A *</label>
          <RichTextEditor
            value={q.optionA}
            onChange={val => updateQuestion(i, "optionA", val)}
            placeholder="Enter option A..."
          />

          <label>Option B *</label>
          <RichTextEditor
            value={q.optionB}
            onChange={val => updateQuestion(i, "optionB", val)}
            placeholder="Enter option B..."
          />

          <label>Option C *</label>
          <RichTextEditor
            value={q.optionC}
            onChange={val => updateQuestion(i, "optionC", val)}
            placeholder="Enter option C..."
          />

          <label>Option D *</label>
          <RichTextEditor
            value={q.optionD}
            onChange={val => updateQuestion(i, "optionD", val)}
            placeholder="Enter option D..."
          />

          <label>Correct Answer *</label>
          <input
            type="text"
            placeholder="A, B, C, or D"
            value={q.correctAnswer}
            onChange={e => updateQuestion(i, "correctAnswer", e.target.value)}
          />

          <label>Marks *</label>
          <input
            type="number"
            min="1"
            value={q.marks}
            onChange={e => updateQuestion(i, "marks", Number(e.target.value))}
          />

          <button type="button" onClick={() => removeQuestion(i)}>
            Remove Question
          </button>
        </div>
      ))}
      <button type="button" onClick={addQuestion}>
        Add Objective Question
      </button>
    </div>
  );
};

export default QuestionSectionObjectives;
