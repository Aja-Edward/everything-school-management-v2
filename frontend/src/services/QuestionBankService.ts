import api from './api';

// Question Bank Types
export interface QuestionBank {
  id: number;
  created_by: number;
  created_by_name: string;
  question_type: 'objective' | 'theory' | 'practical' | 'custom';
  question_type_display: string;
  question: string; // HTML content from RichTextEditor
  question_preview?: string; // For list view
  options: string[]; // For objective questions
  correct_answer: string; // For objective questions
  expected_answer?: string; // For theory/practical
  marking_scheme?: string; // Detailed marking guide
  marks: number;
  subject: number;
  subject_name?: string;
  grade_level: number;
  grade_level_name?: string;
  topic?: string;
  subtopic?: string;
  difficulty: 'easy' | 'medium' | 'hard';
  difficulty_display: string;
  images?: string[]; // Cloudinary URLs
  table_data?: any; // Table structures
  tags: string[];
  is_shared: boolean;
  usage_count: number;
  last_used: string | null;
  created_at: string;
  updated_at: string;
}

export interface QuestionBankCreateData {
  question_type: 'objective' | 'theory' | 'practical' | 'custom';
  question: string;
  options?: string[];
  correct_answer?: string;
  expected_answer?: string;
  marking_scheme?: string;
  marks: number;
  subject: number;
  grade_level: number;
  topic?: string;
  subtopic?: string;
  difficulty: 'easy' | 'medium' | 'hard';
  images?: string[];
  table_data?: any;
  tags?: string[];
  is_shared?: boolean;
}

export interface QuestionBankUpdateData {
  question_type?: 'objective' | 'theory' | 'practical' | 'custom';
  question?: string;
  options?: string[];
  correct_answer?: string;
  expected_answer?: string;
  marking_scheme?: string;
  marks?: number;
  subject?: number;
  grade_level?: number;
  topic?: string;
  subtopic?: string;
  difficulty?: 'easy' | 'medium' | 'hard';
  images?: string[];
  table_data?: any;
  tags?: string[];
  is_shared?: boolean;
}

export interface QuestionBankFilters {
  search?: string;
  question_type?: string;
  subject?: number;
  grade_level?: number;
  topic?: string;
  subtopic?: string;
  difficulty?: string;
  is_shared?: boolean;
  only_mine?: boolean;
  show_shared?: boolean;
  tags?: string;
  ordering?: string;
  page?: number;
  page_size?: number;
}

export interface QuestionBankStatistics {
  total_questions: number;
  questions_by_type: Record<string, number>;
  questions_by_difficulty: Record<string, number>;
  questions_by_subject: Array<{ subject: string; count: number }>;
  most_used_questions: QuestionBank[];
  recently_added: QuestionBank[];
  shared_questions_count: number;
  private_questions_count: number;
}

export interface ImportToExamPayload {
  exam_id: number;
  question_ids: number[];
  section_type: 'objective' | 'theory' | 'practical' | 'custom';
}

export interface BulkImportPayload {
  questions: Array<{
    question_type: string;
    question: string;
    options?: string[];
    correct_answer?: string;
    marks: number;
    subject: number;
    grade_level: number;
    difficulty?: string;
    topic?: string;
  }>;
}

export class QuestionBankService {
  private static baseUrl = '/api/exams/question-bank';

  /**
   * Get all questions with optional filtering
   */
  static async getQuestions(filters: QuestionBankFilters = {}): Promise<{ results: QuestionBank[]; count: number; next: string | null; previous: string | null }> {
    try {
      const params = new URLSearchParams();

      // Add filters to params
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          params.append(key, value.toString());
        }
      });

      const queryString = params.toString();
      const endpoint = `${this.baseUrl}/${queryString ? `?${queryString}` : ''}`;
      const response = await api.get(endpoint);
      return response;
    } catch (error) {
      console.error('QuestionBankService: Error fetching questions:', error);
      throw error;
    }
  }

  /**
   * Get a single question by ID
   */
  static async getQuestion(id: number): Promise<QuestionBank> {
    try {
      const response = await api.get(`${this.baseUrl}/${id}/`);
      return response;
    } catch (error) {
      console.error('QuestionBankService: Error fetching question:', error);
      throw error;
    }
  }

  /**
   * Create a new question
   */
  static async createQuestion(data: QuestionBankCreateData): Promise<QuestionBank> {
    try {
      const response = await api.post(`${this.baseUrl}/`, data);
      return response;
    } catch (error) {
      console.error('QuestionBankService: Error creating question:', error);
      throw error;
    }
  }

  /**
   * Update an existing question
   */
  static async updateQuestion(id: number, data: QuestionBankUpdateData): Promise<QuestionBank> {
    try {
      const response = await api.put(`${this.baseUrl}/${id}/`, data);
      return response;
    } catch (error) {
      console.error('QuestionBankService: Error updating question:', error);
      throw error;
    }
  }

  /**
   * Partially update a question
   */
  static async patchQuestion(id: number, data: Partial<QuestionBankUpdateData>): Promise<QuestionBank> {
    try {
      const response = await api.patch(`${this.baseUrl}/${id}/`, data);
      return response;
    } catch (error) {
      console.error('QuestionBankService: Error patching question:', error);
      throw error;
    }
  }

  /**
   * Delete a question
   */
  static async deleteQuestion(id: number): Promise<void> {
    try {
      await api.delete(`${this.baseUrl}/${id}/`);
    } catch (error) {
      console.error('QuestionBankService: Error deleting question:', error);
      throw error;
    }
  }

  /**
   * Import selected questions into an exam
   */
  static async importToExam(payload: ImportToExamPayload): Promise<{ message: string; imported_count: number }> {
    try {
      const response = await api.post(`${this.baseUrl}/import_to_exam/`, payload);
      return response;
    } catch (error) {
      console.error('QuestionBankService: Error importing questions to exam:', error);
      throw error;
    }
  }

  /**
   * Duplicate a question
   */
  static async duplicateQuestion(id: number, updates?: Partial<QuestionBankCreateData>): Promise<QuestionBank> {
    try {
      const response = await api.post(`${this.baseUrl}/${id}/duplicate/`, updates || {});
      return response;
    } catch (error) {
      console.error('QuestionBankService: Error duplicating question:', error);
      throw error;
    }
  }

  /**
   * Toggle share status of a question
   */
  static async toggleShare(id: number): Promise<QuestionBank> {
    try {
      const response = await api.post(`${this.baseUrl}/${id}/toggle_share/`, {});
      return response;
    } catch (error) {
      console.error('QuestionBankService: Error toggling share status:', error);
      throw error;
    }
  }

  /**
   * Get question bank statistics
   */
  static async getStatistics(): Promise<QuestionBankStatistics> {
    try {
      const response = await api.get(`${this.baseUrl}/statistics/`);
      return response;
    } catch (error) {
      console.error('QuestionBankService: Error fetching statistics:', error);
      throw error;
    }
  }

  /**
   * Bulk import questions
   */
  static async bulkImport(payload: BulkImportPayload): Promise<{ message: string; created_count: number; failed: any[] }> {
    try {
      const response = await api.post(`${this.baseUrl}/bulk_import/`, payload);
      return response;
    } catch (error) {
      console.error('QuestionBankService: Error bulk importing questions:', error);
      throw error;
    }
  }

  /**
   * Get question types for dropdown
   */
  static getQuestionTypes() {
    return [
      { value: 'objective', label: 'Objective (Multiple Choice)' },
      { value: 'theory', label: 'Theory (Essay)' },
      { value: 'practical', label: 'Practical' },
      { value: 'custom', label: 'Custom' },
    ];
  }

  /**
   * Get difficulty levels for dropdown
   */
  static getDifficultyLevels() {
    return [
      { value: 'easy', label: 'Easy' },
      { value: 'medium', label: 'Medium' },
      { value: 'hard', label: 'Hard' },
    ];
  }

  /**
   * Get difficulty color for UI
   */
  static getDifficultyColor(difficulty: string): string {
    const colors = {
      easy: 'bg-green-100 text-green-800 border-green-200',
      medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      hard: 'bg-red-100 text-red-800 border-red-200',
    };
    return colors[difficulty as keyof typeof colors] || 'bg-gray-100 text-gray-800 border-gray-200';
  }

  /**
   * Get question type icon for UI
   */
  static getQuestionTypeIcon(questionType: string): string {
    const icons = {
      objective: '📝',
      theory: '✍️',
      practical: '🔬',
      custom: '🎯',
    };
    return icons[questionType as keyof typeof icons] || '❓';
  }

  /**
   * Validate question data before submission
   */
  static validateQuestionData(data: QuestionBankCreateData): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!data.question || data.question.trim().length === 0) {
      errors.push('Question text is required');
    }

    if (!data.marks || data.marks < 1) {
      errors.push('Marks must be at least 1');
    }

    if (!data.subject) {
      errors.push('Subject is required');
    }

    if (!data.grade_level) {
      errors.push('Grade level is required');
    }

    if (data.question_type === 'objective') {
      if (!data.options || data.options.length < 2) {
        errors.push('Objective questions must have at least 2 options');
      }
      if (!data.correct_answer || data.correct_answer.trim().length === 0) {
        errors.push('Objective questions must have a correct answer');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Format question preview text (strip HTML tags)
   */
  static formatQuestionPreview(html: string, maxLength: number = 100): string {
    const cleanText = html.replace(/<[^>]+>/g, '');
    return cleanText.length > maxLength
      ? `${cleanText.substring(0, maxLength)}...`
      : cleanText;
  }

  /**
   * Get usage badge text
   */
  static getUsageBadge(usageCount: number): { text: string; color: string } {
    if (usageCount === 0) {
      return { text: 'Never used', color: 'bg-gray-100 text-gray-600' };
    } else if (usageCount < 5) {
      return { text: `Used ${usageCount}x`, color: 'bg-blue-100 text-blue-600' };
    } else if (usageCount < 10) {
      return { text: `Used ${usageCount}x`, color: 'bg-green-100 text-green-600' };
    } else {
      return { text: `Popular (${usageCount}x)`, color: 'bg-purple-100 text-purple-600' };
    }
  }
}
