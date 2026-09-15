// components/QuestionSectionObjectives.tsx
import React from "react";
import { ObjectiveAnswerFields, RichTextEditor } from "@/components/shared/ExamEditor";
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
  const replaceQuestion = (index: number, question: ObjectiveQuestion) => {
    const updated = [...value];
    updated[index] = question;
    onChange(updated);
  };
  const updateQuestion = (index: number, field: keyof ObjectiveQuestion, val: ObjectiveQuestion[keyof ObjectiveQuestion]) =>
    replaceQuestion(index, { ...value[index], [field]: val } as ObjectiveQuestion);
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

          <ObjectiveAnswerFields
            question={q}
            onChange={question => replaceQuestion(i, question)}
            optionsClassName="space-y-3"
            renderOption={letter => (
              <div>
                <label>Option {letter}</label>
                <RichTextEditor
                  value={q[`option${letter}`] ?? ""}
                  onChange={val => updateQuestion(i, `option${letter}`, val)}
                  placeholder={`Enter option ${letter}...`}
                />
              </div>
            )}
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
