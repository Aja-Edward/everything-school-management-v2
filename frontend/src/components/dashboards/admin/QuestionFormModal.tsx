import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BankAnswerType, QuestionBankService, QuestionBank, QuestionBankCreateData } from '@/services/QuestionBankService';
import { ANSWER_TYPES, parseKeys } from '@/utils/objectiveQuestions';
import { MathTextInput, RichTextEditor } from '@/components/shared/ExamEditor';
import { toast } from 'react-hot-toast';

interface QuestionFormModalProps {
  question: QuestionBank | null;
  subjects: any[];
  gradeLevels: any[];
  onClose: () => void;
  onSuccess: () => void;
}

const QuestionFormModal: React.FC<QuestionFormModalProps> = ({
  question,
  subjects,
  gradeLevels,
  onClose,
  onSuccess,
}) => {
  const isEditing = !!question;

  const [formData, setFormData] = useState<QuestionBankCreateData>({
    question_type: 'objective',
    question: '',
    options: ['', '', '', ''],
    correct_answer: '',
    answer_type: 'single',
    partial_credit: false,
    tolerance: '',
    unit: '',
    expected_answer: '',
    marking_scheme: '',
    marks: 1,
    subject: 0,
    grade_level: 0,
    topic: '',
    subtopic: '',
    difficulty: 'medium',
    tags: [],
    is_shared: false,
  });

  const [tagInput, setTagInput] = useState('');
  const answerType = formData.answer_type ?? 'single';
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (question) {
      setFormData({
        question_type: question.question_type,
        question: question.question,
        options: question.options || ['', '', '', ''],
        correct_answer: question.correct_answer || '',
        answer_type: question.answer_type || 'single',
        partial_credit: !!question.partial_credit,
        tolerance: Number(question.tolerance) ? String(Number(question.tolerance)) : '',
        unit: question.unit || '',
        expected_answer: question.expected_answer || '',
        marking_scheme: question.marking_scheme || '',
        marks: question.marks,
        subject: question.subject,
        grade_level: question.grade_level,
        topic: question.topic || '',
        subtopic: question.subtopic || '',
        difficulty: question.difficulty,
        tags: question.tags || [],
        is_shared: question.is_shared,
      });
    }
  }, [question]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate
    const validation = QuestionBankService.validateQuestionData(formData);
    if (!validation.valid) {
      validation.errors.forEach((error) => toast.error(error));
      return;
    }

    // The server wants a number for the margin; blank means exact.
    const payload = { ...formData, tolerance: String(formData.tolerance ?? '').trim() || 0 };

    setLoading(true);
    try {
      if (isEditing) {
        await QuestionBankService.updateQuestion(question.id, payload);
        toast.success('Question updated successfully');
      } else {
        await QuestionBankService.createQuestion(payload);
        toast.success('Question created successfully');
      }
      onSuccess();
    } catch (error: any) {
      console.error('Error saving question:', error);
      toast.error(error.message || 'Failed to save question');
    } finally {
      setLoading(false);
    }
  };

  const updateOption = (index: number, value: string) => {
    const newOptions = [...formData.options!];
    newOptions[index] = value;
    setFormData({ ...formData, options: newOptions });
  };

  const addOption = () => {
    setFormData({ ...formData, options: [...(formData.options || []), ''] });
  };

  const removeOption = (index: number) => {
    const newOptions = formData.options!.filter((_, i) => i !== index);
    setFormData({ ...formData, options: newOptions });
  };

  /** Change how the question is answered, keeping what still makes sense. */
  const setAnswerType = (type: BankAnswerType) => {
    const from = formData.answer_type ?? 'single';
    if (type === from) return;
    let options = formData.options ?? [];
    if (type === 'true_false') options = ['True', 'False'];
    else if (from === 'true_false') options = ['', '', '', ''];
    const keepAnswer = from === 'single' && type === 'multiple';
    setFormData({
      ...formData, answer_type: type, options, correct_answer: keepAnswer ? formData.correct_answer : '',
      partial_credit: false, tolerance: '', unit: '',
    });
  };

  const addTag = () => {
    if (tagInput.trim() && !formData.tags?.includes(tagInput.trim())) {
      setFormData({ ...formData, tags: [...(formData.tags || []), tagInput.trim()] });
      setTagInput('');
    }
  };

  const removeTag = (tag: string) => {
    setFormData({ ...formData, tags: formData.tags?.filter((t) => t !== tag) });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
          <h2 className="text-2xl font-bold">
            {isEditing ? 'Edit Question' : 'Create New Question'}
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Question Type */}
          <div>
            <label className="block text-sm font-medium mb-2">Question Type *</label>
            <select
              value={formData.question_type}
              onChange={(e) => setFormData({ ...formData, question_type: e.target.value as any })}
              className="w-full px-3 py-2 border rounded-lg"
              required
            >
              {QuestionBankService.getQuestionTypes().map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          {/* Question Text */}
          <div>
            <label className="block text-sm font-medium mb-2">Question *</label>
            <RichTextEditor
              value={formData.question}
              onChange={(html) => setFormData({ ...formData, question: html })}
              placeholder="Enter your question here (supports rich text, images, tables)"
              minHeight={150}
              enableImageUpload={true}
              enableTables={true}
            />
          </div>

          {/* How an objective question is answered, its options and its answer */}
          {formData.question_type === 'objective' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Answer type</label>
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Answer type">
                  {ANSWER_TYPES.map((type) => (
                    <button
                      key={type.value}
                      type="button"
                      role="radio"
                      aria-checked={answerType === type.value}
                      onClick={() => setAnswerType(type.value)}
                      className={`rounded-full border px-3 py-1 text-sm ${answerType === type.value ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-100'}`}
                    >
                      {type.label}
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-xs text-gray-500">{ANSWER_TYPES.find((type) => type.value === answerType)?.hint}</p>
              </div>

              {(answerType === 'single' || answerType === 'multiple') && (
                <div>
                  <label className="block text-sm font-medium mb-2">Options *</label>
                  <div className="space-y-2">
                    {formData.options?.map((option, index) => (
                      <div key={index} className="flex gap-2">
                        <MathTextInput
                          wrapperClassName="flex-1"
                          value={option}
                          onChange={(value) => updateOption(index, value)}
                          placeholder={`Option ${String.fromCharCode(65 + index)}`}
                          required
                          className="h-9 rounded-lg border border-gray-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        {formData.options!.length > 2 && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => removeOption(index)}
                          >
                            Remove
                          </Button>
                        )}
                      </div>
                    ))}
                    <Button type="button" variant="outline" size="sm" onClick={addOption}>
                      Add Option
                    </Button>
                  </div>
                </div>
              )}

              {answerType === 'single' && (
                <div>
                  <label className="block text-sm font-medium mb-2">Correct Answer *</label>
                  <select
                    value={formData.correct_answer}
                    onChange={(e) => setFormData({ ...formData, correct_answer: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                    required
                  >
                    <option value="">Select correct answer</option>
                    {formData.options?.map((option, index) => (
                      <option key={index} value={String.fromCharCode(65 + index)}>
                        {String.fromCharCode(65 + index)} - {option.substring(0, 50)}
                        {option.length > 50 ? '...' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {answerType === 'multiple' && (
                <fieldset>
                  <legend className="block text-sm font-medium mb-2">Correct answers: tick every one that is right *</legend>
                  <div className="flex flex-wrap gap-x-4 gap-y-2">
                    {formData.options?.map((option, index) => {
                      const letter = String.fromCharCode(65 + index);
                      const keys = parseKeys(formData.correct_answer);
                      const ticked = keys.includes(letter);
                      return (
                        <label key={letter} className="flex items-center gap-1.5 text-sm">
                          <input
                            type="checkbox"
                            checked={ticked}
                            onChange={() => setFormData({
                              ...formData,
                              correct_answer: (ticked ? keys.filter((k) => k !== letter) : [...keys, letter]).sort().join(','),
                            })}
                          />
                          {letter}{option ? ` - ${option.substring(0, 30)}` : ''}
                        </label>
                      );
                    })}
                  </div>
                  <label className="mt-3 flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={!!formData.partial_credit}
                      onChange={(e) => setFormData({ ...formData, partial_credit: e.target.checked })}
                    />
                    <span>
                      Give part marks
                      <span className="block text-xs text-gray-500">
                        A share of the marks for each right option ticked, less one for each wrong one.
                      </span>
                    </span>
                  </label>
                </fieldset>
              )}

              {answerType === 'true_false' && (
                <fieldset>
                  <legend className="block text-sm font-medium mb-2">Correct Answer *</legend>
                  <div className="flex gap-3">
                    {['True', 'False'].map((value) => (
                      <label key={value} className="flex items-center gap-2 rounded-lg border px-4 py-2 text-sm">
                        <input
                          type="radio"
                          checked={formData.correct_answer === value}
                          onChange={() => setFormData({ ...formData, correct_answer: value })}
                        />
                        {value}
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}

              {answerType === 'numeric' && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <label className="block text-sm">
                    <span className="block font-medium mb-1">Correct answer *</span>
                    <input
                      value={formData.correct_answer ?? ''}
                      onChange={(e) => setFormData({ ...formData, correct_answer: e.target.value })}
                      inputMode="decimal"
                      maxLength={50}
                      placeholder="e.g. 12.5 or 3/4"
                      className="w-full px-3 py-2 border rounded-lg"
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="block font-medium mb-1">Allowed either side</span>
                    <input
                      value={String(formData.tolerance ?? '')}
                      onChange={(e) => setFormData({ ...formData, tolerance: e.target.value })}
                      inputMode="decimal"
                      placeholder="0 (exact)"
                      className="w-full px-3 py-2 border rounded-lg"
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="block font-medium mb-1">Unit (optional)</span>
                    <input
                      value={formData.unit ?? ''}
                      onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                      maxLength={30}
                      placeholder="e.g. cm"
                      className="w-full px-3 py-2 border rounded-lg"
                    />
                  </label>
                </div>
              )}
            </div>
          )}

          {/* Expected Answer (for theory/practical) */}
          {(formData.question_type === 'theory' || formData.question_type === 'practical') && (
            <div>
              <label className="block text-sm font-medium mb-2">Expected Answer/Guide</label>
              <RichTextEditor
                value={formData.expected_answer || ''}
                onChange={(html) => setFormData({ ...formData, expected_answer: html })}
                placeholder="Enter expected answer or marking guide"
                minHeight={100}
                simplified={true}
              />
            </div>
          )}

          {/* Marking Scheme */}
          <div>
            <label className="block text-sm font-medium mb-2">Detailed Marking Scheme</label>
            <RichTextEditor
              value={formData.marking_scheme || ''}
              onChange={(html) => setFormData({ ...formData, marking_scheme: html })}
              placeholder="Enter detailed marking scheme"
              minHeight={100}
              simplified={true}
            />
          </div>

          {/* Subject and Grade Level */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Subject *</label>
              <select
                value={formData.subject}
                onChange={(e) => setFormData({ ...formData, subject: Number(e.target.value) })}
                className="w-full px-3 py-2 border rounded-lg"
                required
              >
                <option value={0}>Select subject</option>
                {subjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Grade Level *</label>
              <select
                value={formData.grade_level}
                onChange={(e) => setFormData({ ...formData, grade_level: Number(e.target.value) })}
                className="w-full px-3 py-2 border rounded-lg"
                required
              >
                <option value={0}>Select grade level</option>
                {gradeLevels.map((level) => (
                  <option key={level.id} value={level.id}>
                    {level.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Topic and Subtopic */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Topic</label>
              <Input
                value={formData.topic}
                onChange={(e) => setFormData({ ...formData, topic: e.target.value })}
                placeholder="e.g., Algebra, Photosynthesis"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Subtopic</label>
              <Input
                value={formData.subtopic}
                onChange={(e) => setFormData({ ...formData, subtopic: e.target.value })}
                placeholder="e.g., Quadratic Equations"
              />
            </div>
          </div>

          {/* Difficulty and Marks */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Difficulty *</label>
              <select
                value={formData.difficulty}
                onChange={(e) => setFormData({ ...formData, difficulty: e.target.value as any })}
                className="w-full px-3 py-2 border rounded-lg"
                required
              >
                {QuestionBankService.getDifficultyLevels().map((level) => (
                  <option key={level.value} value={level.value}>
                    {level.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Marks *</label>
              <Input
                type="number"
                min="1"
                value={formData.marks}
                onChange={(e) => setFormData({ ...formData, marks: Number(e.target.value) })}
                required
              />
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="block text-sm font-medium mb-2">Tags</label>
            <div className="flex gap-2 mb-2">
              <Input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addTag();
                  }
                }}
                placeholder="Add tag and press Enter"
              />
              <Button type="button" variant="outline" onClick={addTag}>
                Add
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {formData.tags?.map((tag) => (
                <span
                  key={tag}
                  className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm flex items-center gap-2"
                >
                  {tag}
                  <button type="button" onClick={() => removeTag(tag)} className="hover:text-blue-900">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>

          {/* Share Question */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is_shared"
              checked={formData.is_shared}
              onChange={(e) => setFormData({ ...formData, is_shared: e.target.checked })}
              className="w-4 h-4"
            />
            <label htmlFor="is_shared" className="text-sm font-medium">
              Share this question with other teachers
            </label>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Saving...' : isEditing ? 'Update Question' : 'Create Question'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default QuestionFormModal;
