/**
 * Shared ExamEditor Components
 *
 * Provides unified rich text editing for exam questions across Admin and Teacher dashboards.
 *
 * Usage:
 * ```tsx
 * import { RichTextEditor, ImageUploader } from '@/components/shared/ExamEditor';
 *
 * <RichTextEditor
 *   value={questionHtml}
 *   onChange={setQuestionHtml}
 *   placeholder="Enter question..."
 *   enableImageUpload={true}
 *   enableTables={true}
 * />
 * ```
 */

export { default as RichTextEditor } from './RichTextEditor';
export { ImageUploader, uploadImageToCloudinary } from './ImageUploader';
export * from './types';
