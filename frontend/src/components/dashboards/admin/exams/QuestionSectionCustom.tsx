// components/QuestionSectionCustom.tsx
import React from "react";
import { RichTextEditor } from "@/components/shared/ExamEditor";
import { CustomSection, Question } from "@/types/types";



interface Props {
  value: CustomSection[];
  onChange: (sections: CustomSection[]) => void;
}

function emptySection(): CustomSection {
  return {
    id: Date.now(),
    name: "",
    instructions: "",
    questions: [],
  };
}

function emptySectionQuestion(): Question {
  return {
    id: Date.now(),
    question: "",
    marks: 1,
    wordLimit: "",
  };
}

const QuestionSectionCustom: React.FC<Props> = ({ value, onChange }) => {
  const addSection = () => onChange([...value, emptySection()]);

  const removeSection = (idx: number) => {
    const updated = [...value];
    updated.splice(idx, 1);
    onChange(updated);
  };

  const updateSection = (index: number, key: keyof CustomSection, val: any) => {
    const updated = [...value];
    updated[index] = {
      ...updated[index],
      [key]: val,
    } as CustomSection;
    onChange(updated);
  };

  const addQuestion = (sidx: number) => {
    const updated = [...value];
    if (!updated[sidx].questions) updated[sidx].questions = [];
    updated[sidx].questions.push(emptySectionQuestion());
    onChange(updated);
  };

  const updateQuestion = (
    sidx: number,
    qidx: number,
    key: keyof Question,
    val: Question[keyof Question]
  ) => {
    const updated = [...value];
    updated[sidx].questions[qidx] = {
      ...updated[sidx].questions[qidx],
      [key]: val,
    };
    onChange(updated);
  };

  const removeQuestion = (sidx: number, qidx: number) => {
    const updated = [...value];
    updated[sidx].questions.splice(qidx, 1);
    onChange(updated);
  };

  return (
    <div className="section-block">
      <h4>Custom Sections</h4>
      {value.map((section, i) => (
        <div key={section.id} className="custom-section-block">
          <label>Section Name *</label>
          <input
            type="text"
            placeholder="Section Name"
            value={section.name}
            onChange={e => updateSection(i, "name", e.target.value)}
          />

          <label>Instructions</label>
          <RichTextEditor
            value={section.instructions}
            onChange={val => updateSection(i, "instructions", val)}
            placeholder="Enter section instructions..."
          />

          <div style={{ marginTop: 16, marginLeft: 16 }}>
            <strong>Questions</strong>
            {section.questions.map((q, j) => (
              <div className="custom-section-q-block" key={q.id}>
                <label>Question *</label>
                <RichTextEditor
                  value={q.question}
                  onChange={val => updateQuestion(i, j, "question", val)}
                  placeholder="Enter question text..."
                />

                <label>Marks *</label>
                <input
                  type="number"
                  min="1"
                  value={q.marks}
                  onChange={e => updateQuestion(i, j, "marks", Number(e.target.value))}
                />

                <label>Word Limit</label>
                <input
                  type="text"
                  placeholder="Word Limit"
                  value={q.wordLimit || ""}
                  onChange={e => updateQuestion(i, j, "wordLimit", e.target.value)}
                />

                <button type="button" onClick={() => removeQuestion(i, j)}>
                  Remove Question
                </button>
              </div>
            ))}
            <button type="button" onClick={() => addQuestion(i)}>
              Add Question
            </button>
          </div>

          <button type="button" onClick={() => removeSection(i)} style={{ marginTop: 12 }}>
            Remove Section
          </button>
        </div>
      ))}
      <button type="button" onClick={addSection}>
        Add Custom Section
      </button>
    </div>
  );
};

export default QuestionSectionCustom;

