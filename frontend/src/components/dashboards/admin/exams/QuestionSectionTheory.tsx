// components/QuestionSectionTheory.tsx
import React from "react";
import { RichTextEditor } from "@/components/shared/ExamEditor";
import { TheoryQuestion, SubQuestion } from "@/types/types";



interface Props {
  value: TheoryQuestion[];
  onChange: (questions: TheoryQuestion[]) => void;
}

const emptySubQuestion = (): SubQuestion => ({
  id: Date.now(),
  question: "",
  expectedPoints: "",
  marks: 1,
  wordLimit: "",
  subSubQuestions: [],
});

const emptyQuestion = (): TheoryQuestion => ({
  id: Date.now(),
  question: "",
  expectedPoints: "",
  marks: 1,
  wordLimit: "",
  subQuestions: [],
});

const QuestionSectionTheory: React.FC<Props> = ({ value, onChange }) => {
  const addQuestion = () => onChange([...value, emptyQuestion()]);

  function updateQuestion<K extends keyof TheoryQuestion>(index: number, field: K, val: TheoryQuestion[K]) {
    const updated = [...value];
    // update the specific question immutably
    updated[index] = { ...updated[index], [field]: val } as TheoryQuestion;
    onChange(updated);
  }

  const removeQuestion = (index: number) => {
    const updated = [...value];
    updated.splice(index, 1);
    onChange(updated);
  };

  const addSubQuestion = (qi: number) => {
    const updated = [...value];
    const q = updated[qi];
    const newSubQuestions = [...q.subQuestions, emptySubQuestion()];
    updated[qi] = { ...q, subQuestions: newSubQuestions } as TheoryQuestion;
    onChange(updated);
  };

  function updateSubQuestion<K extends keyof SubQuestion>(qi: number, si: number, field: K, val: SubQuestion[K]) {
    const updated = [...value];
    const q = updated[qi];
    const subQuestions = [...q.subQuestions];
    subQuestions[si] = { ...subQuestions[si], [field]: val } as SubQuestion;
    updated[qi] = { ...q, subQuestions } as TheoryQuestion;
    onChange(updated);
  }

  const removeSubQuestion = (qi: number, si: number) => {
    const updated = [...value];
    const q = updated[qi];
    const subQuestions = q.subQuestions.filter((_, idx) => idx !== si);
    updated[qi] = { ...q, subQuestions } as TheoryQuestion;
    onChange(updated);
  };

  return (
    <div className="section-block">
      <h4>Theory Questions</h4>
      {value.map((q, i) => (
        <div className="theory-q-block" key={q.id}>
          <label>Question *</label>
          <RichTextEditor
            value={q.question}
            onChange={val => updateQuestion(i, "question", val)}
            placeholder="Enter question text..."
          />

          <label>Expected Points</label>
          <RichTextEditor
            value={q.expectedPoints}
            onChange={val => updateQuestion(i, "expectedPoints", val)}
            placeholder="Enter expected points..."
          />

          <label>Marks *</label>
          <input
            type="number"
            min="1"
            value={q.marks}
            onChange={e => updateQuestion(i, "marks", Number(e.target.value))}
          />

          <label>Word Limit</label>
          <input
            type="text"
            value={q.wordLimit || ""}
            onChange={e => updateQuestion(i, "wordLimit", e.target.value)}
            placeholder="e.g., 200 words"
          />

          <button type="button" onClick={() => removeQuestion(i)}>
            Remove Theory Question
          </button>

          <div style={{ marginTop: 16, marginLeft: 16 }}>
            <strong>Sub Questions</strong>
            {q.subQuestions.map((sq, j) => (
              <div className="sub-q-block" key={sq.id} style={{ marginTop: 8 }}>
                <label>Sub Question *</label>
                <RichTextEditor
                  value={sq.question}
                  onChange={val => updateSubQuestion(i, j, "question", val)}
                  placeholder="Enter sub question..."
                />

                <label>Expected Points</label>
                <RichTextEditor
                  value={sq.expectedPoints}
                  onChange={val => updateSubQuestion(i, j, "expectedPoints", val)}
                  placeholder="Enter expected points..."
                />

                <label>Marks *</label>
                <input
                  type="number"
                  min="1"
                  value={sq.marks}
                  onChange={e => updateSubQuestion(i, j, "marks", Number(e.target.value))}
                />

                <label>Word Limit</label>
                <input
                  type="text"
                  value={sq.wordLimit || ""}
                  onChange={e => updateSubQuestion(i, j, "wordLimit", e.target.value)}
                  placeholder="e.g., 100 words"
                />

                <button type="button" onClick={() => removeSubQuestion(i, j)}>
                  Remove Sub Question
                </button>
              </div>
            ))}
            <button type="button" onClick={() => addSubQuestion(i)}>
              Add Sub Question
            </button>
          </div>
        </div>
      ))}
      <button type="button" onClick={addQuestion}>
        Add Theory Question
      </button>
    </div>
  );
};

export default QuestionSectionTheory;
