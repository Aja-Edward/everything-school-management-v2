import api from './api';

// Exam Template Types (CORRECTED to match backend models)
export interface TemplateSection {
  type: string; // 'objective', 'theory', 'practical', 'custom'
  name: string;
  questionCount: number;
  marksPerQuestion: number;
  instructions?: string;
}

export interface TemplateStructure {
  sections: TemplateSection[];
}

export interface ExamTemplate {
  id: number;
  created_by: number;
  created_by_name?: string;
  name: string;
  description?: string;
  subject?: number | null;
  subject_name?: string;
  grade_level: number;
  grade_level_name?: string;

  // Structure (as JSON)
  structure: TemplateStructure;
  total_marks: number;
  duration_minutes?: number | null;

  // Instructions (as JSON)
  default_instructions: Record<string, string>; // { general: '', objective: '', theory: '', practical: '' }

  // Sharing and usage
  is_shared: boolean;
  usage_count: number;

  created_at: string;
  updated_at: string;
}

export interface ExamTemplateCreateData {
  name: string;
  description?: string;
  subject?: number | null;
  grade_level: number;
  structure: TemplateStructure;
  total_marks: number;
  duration_minutes?: number | null;
  default_instructions?: Record<string, string>;
  is_shared?: boolean;
}

export interface ExamTemplateUpdateData {
  name?: string;
  description?: string;
  subject?: number | null;
  grade_level?: number;
  structure?: TemplateStructure;
  total_marks?: number;
  duration_minutes?: number | null;
  default_instructions?: Record<string, string>;
  is_shared?: boolean;
}

export interface ExamTemplateFilters {
  search?: string;
  subject?: number;
  grade_level?: number;
  is_shared?: boolean;
  only_mine?: boolean;
  show_shared?: boolean;
  ordering?: string;
  page?: number;
  page_size?: number;
}

export interface ExamTemplateStatistics {
  total_templates: number;
  templates_by_subject: Array<{ subject: string; count: number }>;
  most_used_templates: ExamTemplate[];
  recently_created: ExamTemplate[];
  shared_templates_count: number;
  private_templates_count: number;
}

export interface ApplyTemplatePayload {
  exam_id: number;
  override_existing?: boolean;
}

export class ExamTemplateService {
  private static baseUrl = '/api/exams/exam-templates';

  /**
   * Get all exam templates with optional filtering
   */
  static async getTemplates(filters: ExamTemplateFilters = {}): Promise<{ results: ExamTemplate[]; count: number; next: string | null; previous: string | null }> {
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
      console.error('ExamTemplateService: Error fetching templates:', error);
      throw error;
    }
  }

  /**
   * Get a single template by ID
   */
  static async getTemplate(id: number): Promise<ExamTemplate> {
    try {
      const response = await api.get(`${this.baseUrl}/${id}/`);
      return response;
    } catch (error) {
      console.error('ExamTemplateService: Error fetching template:', error);
      throw error;
    }
  }

  /**
   * Create a new template
   */
  static async createTemplate(data: ExamTemplateCreateData): Promise<ExamTemplate> {
    try {
      const response = await api.post(`${this.baseUrl}/`, data);
      return response;
    } catch (error) {
      console.error('ExamTemplateService: Error creating template:', error);
      throw error;
    }
  }

  /**
   * Update an existing template
   */
  static async updateTemplate(id: number, data: ExamTemplateUpdateData): Promise<ExamTemplate> {
    try {
      const response = await api.put(`${this.baseUrl}/${id}/`, data);
      return response;
    } catch (error) {
      console.error('ExamTemplateService: Error updating template:', error);
      throw error;
    }
  }

  /**
   * Partially update a template
   */
  static async patchTemplate(id: number, data: Partial<ExamTemplateUpdateData>): Promise<ExamTemplate> {
    try {
      const response = await api.patch(`${this.baseUrl}/${id}/`, data);
      return response;
    } catch (error) {
      console.error('ExamTemplateService: Error patching template:', error);
      throw error;
    }
  }

  /**
   * Delete a template
   */
  static async deleteTemplate(id: number): Promise<void> {
    try {
      await api.delete(`${this.baseUrl}/${id}/`);
    } catch (error) {
      console.error('ExamTemplateService: Error deleting template:', error);
      throw error;
    }
  }

  /**
   * Apply a template to an exam
   */
  static async applyTemplate(templateId: number, examId: number, overrideExisting: boolean = false): Promise<{ message: string; exam: any }> {
    try {
      const response = await api.post(`${this.baseUrl}/${templateId}/apply/`, {
        exam_id: examId,
        override_existing: overrideExisting,
      });
      return response;
    } catch (error) {
      console.error('ExamTemplateService: Error applying template:', error);
      throw error;
    }
  }

  /**
   * Duplicate a template
   */
  static async duplicateTemplate(id: number, newName?: string): Promise<ExamTemplate> {
    try {
      const response = await api.post(`${this.baseUrl}/${id}/duplicate/`, {
        new_name: newName,
      });
      return response;
    } catch (error) {
      console.error('ExamTemplateService: Error duplicating template:', error);
      throw error;
    }
  }

  /**
   * Toggle share status of a template
   */
  static async toggleShare(id: number): Promise<ExamTemplate> {
    try {
      const response = await api.post(`${this.baseUrl}/${id}/toggle_share/`, {});
      return response;
    } catch (error) {
      console.error('ExamTemplateService: Error toggling share status:', error);
      throw error;
    }
  }

  /**
   * Get template statistics
   */
  static async getStatistics(): Promise<ExamTemplateStatistics> {
    try {
      const response = await api.get(`${this.baseUrl}/statistics/`);
      return response;
    } catch (error) {
      console.error('ExamTemplateService: Error fetching statistics:', error);
      throw error;
    }
  }

  /**
   * Get template usage badge
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

  /**
   * Validate template data before submission
   */
  static validateTemplateData(data: ExamTemplateCreateData): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!data.name || data.name.trim().length === 0) {
      errors.push('Template name is required');
    }

    if (!data.grade_level) {
      errors.push('Grade level is required');
    }

    if (!data.structure || !data.structure.sections || data.structure.sections.length === 0) {
      errors.push('Template must have at least one section');
    }

    if (data.duration_minutes && data.duration_minutes < 1) {
      errors.push('Duration must be at least 1 minute');
    }

    if (!data.total_marks || data.total_marks < 1) {
      errors.push('Total marks must be at least 1');
    }

    // Validate structure sections
    if (data.structure && data.structure.sections) {
      data.structure.sections.forEach((section, index) => {
        if (!section.type) {
          errors.push(`Section ${index + 1}: Type is required`);
        }
        if (!section.name) {
          errors.push(`Section ${index + 1}: Name is required`);
        }
        if (!section.questionCount || section.questionCount < 1) {
          errors.push(`Section ${index + 1}: Question count must be at least 1`);
        }
        if (!section.marksPerQuestion || section.marksPerQuestion < 1) {
          errors.push(`Section ${index + 1}: Marks per question must be at least 1`);
        }
      });
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Calculate total questions count from structure
   */
  static getTotalQuestionsCount(template: ExamTemplate): number {
    if (!template.structure || !template.structure.sections) {
      return 0;
    }
    return template.structure.sections.reduce((total, section) => total + section.questionCount, 0);
  }

  /**
   * Calculate total marks from structure
   */
  static calculateTotalMarks(structure: TemplateStructure): number {
    if (!structure || !structure.sections) {
      return 0;
    }
    return structure.sections.reduce(
      (total, section) => total + (section.questionCount * section.marksPerQuestion),
      0
    );
  }

  /**
   * Get section breakdown text
   */
  static getSectionBreakdown(template: ExamTemplate): string {
    if (!template.structure || !template.structure.sections) {
      return 'No sections';
    }

    const sections = template.structure.sections.map(
      (section) => `${section.questionCount} ${section.name}`
    );

    return sections.join(', ') || 'No sections';
  }

  /**
   * Format template for display (summary card)
   */
  static formatTemplateSummary(template: ExamTemplate): string {
    const parts: string[] = [];

    if (template.duration_minutes) {
      parts.push(`${template.duration_minutes} mins`);
    }
    if (template.total_marks) {
      parts.push(`${template.total_marks} marks`);
    }

    const questionsCount = this.getTotalQuestionsCount(template);
    if (questionsCount > 0) {
      parts.push(`${questionsCount} questions`);
    }

    return parts.join(' • ');
  }

  /**
   * Get section types for dropdown
   */
  static getSectionTypes() {
    return [
      { value: 'objective', label: 'Objective (Multiple Choice)' },
      { value: 'theory', label: 'Theory (Essay)' },
      { value: 'practical', label: 'Practical' },
      { value: 'custom', label: 'Custom' },
    ];
  }

  /**
   * Get exam types for dropdown
   */
  static getExamTypes() {
    return [
      { value: 'midterm', label: 'Midterm Exam' },
      { value: 'final', label: 'Final Exam' },
      { value: 'quiz', label: 'Quiz' },
      { value: 'test', label: 'Test' },
      { value: 'assignment', label: 'Assignment' },
      { value: 'other', label: 'Other' },
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
}
