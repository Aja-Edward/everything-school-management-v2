/**
 * Exam Data Normalization Utilities - HTML-First Approach
 *
 * UPDATED: 2025-01-22
 * Strategy: Store all rich content (images, tables, formatting) as HTML in the question field.
 * This eliminates the mismatch between teacher and admin editing where separate image/table
 * fields were getting lost during the edit cycle.
 *
 * Both dashboards use the same RichTextEditor (Tiptap) which embeds:
 * - Images (via Cloudinary upload) directly in HTML as <img> tags
 * - Tables directly in HTML as <table> elements
 * - Text formatting (bold, italic, etc.) as HTML tags
 *
 * This normalizer now:
 * - Preserves HTML content as-is from RichTextEditor
 * - Maintains backward compatibility with legacy separate image/table fields
 * - Converts plain text to HTML for consistent rendering
 */

/**
 * Check if a string contains HTML tags
 */
const isHtmlContent = (text: string): boolean => {
  if (!text || typeof text !== 'string') return false;
  // Check for common HTML tags that RichTextEditor might produce
  return /<(?:p|div|span|br|strong|em|u|s|h[1-6]|ul|ol|li|table|img|a|blockquote|pre|code)[^>]*>/i.test(text);
};

/**
 * Convert plain text to simple HTML (wrap in paragraph tags)
 * Preserves existing HTML content
 */
const ensureHtmlFormat = (text: string): string => {
  if (!text || typeof text !== 'string') return '';

  // If already HTML, return as-is
  if (isHtmlContent(text)) {
    return text;
  }

  // Convert plain text to HTML
  // Replace newlines with <br> and wrap in paragraph
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');

  return `<p>${escaped}</p>`;
};

/**
 * Normalize exam data before saving
 *
 * UPDATED: HTML-First Approach
 * - Question content (with embedded images/tables) is preserved as HTML
 * - Backward compatibility: Legacy separate image/table fields are maintained if present
 * - RichTextEditor embeds all content in the question HTML, no extraction needed
 */
export const normalizeExamDataForSave = (examData: any) => {
  const normalized = { ...examData };

  // Helper to normalize a single question for save
  const normalizeQuestionForSave = (q: any) => {
    const result = { ...q };

    // BACKWARD COMPATIBILITY: Maintain separate image/table fields if they exist
    // But don't create them if they don't exist (HTML-first approach)
    if (q.imageUrl || q.image) {
      result.image = q.imageUrl || q.image || null;
      result.imageUrl = q.imageUrl || q.image || null;
      result.image_alt = q.imageAlt || q.image_alt || null;
    }

    if (q.table) {
      // Ensure table is stringified if it's an object (for backward compatibility)
      result.table = typeof q.table === 'string' ? q.table : JSON.stringify(q.table);
    }

    // IMPORTANT: Keep question HTML as-is - it contains embedded images and tables
    // from RichTextEditor (Tiptap)
    return result;
  };

  // Normalize objective questions
  if (normalized.objective_questions?.length > 0) {
    normalized.objective_questions = normalized.objective_questions.map(normalizeQuestionForSave);
  }

  // Normalize theory questions
  if (normalized.theory_questions?.length > 0) {
    normalized.theory_questions = normalized.theory_questions.map((q: any) => {
      const normalizedQ = normalizeQuestionForSave(q);

      // Normalize sub-questions
      if (normalizedQ.subQuestions?.length > 0) {
        normalizedQ.subQuestions = normalizedQ.subQuestions.map((sq: any) => {
          const normalizedSq = normalizeQuestionForSave(sq);

          // Normalize sub-sub-questions
          if (normalizedSq.subSubQuestions?.length > 0) {
            normalizedSq.subSubQuestions = normalizedSq.subSubQuestions.map(normalizeQuestionForSave);
          }

          return normalizedSq;
        });
      }

      return normalizedQ;
    });
  }

  // Normalize practical questions
  if (normalized.practical_questions?.length > 0) {
    normalized.practical_questions = normalized.practical_questions.map(normalizeQuestionForSave);
  }

  // Normalize custom sections
  if (normalized.custom_sections?.length > 0) {
    normalized.custom_sections = normalized.custom_sections.map((section: any) => ({
      ...section,
      questions: (section.questions || []).map(normalizeQuestionForSave)
    }));
  }

  console.log('✅ Normalized exam data for save (HTML-first):', {
    objective: normalized.objective_questions?.length || 0,
    theory: normalized.theory_questions?.length || 0,
    practical: normalized.practical_questions?.length || 0,
    custom: normalized.custom_sections?.length || 0
  });

  return normalized;
};

/**
 * Normalize exam data after loading from API
 * Converts unified format to teacher format for editing
 */
// export const normalizeExamDataForEdit = (examData: any) => {
//   const normalized = { ...examData };

//   console.log('🔄 Normalizing exam data for edit:', examData);

//   // Normalize objective questions
//   if (normalized.objective_questions?.length > 0) {
//     normalized.objective_questions = normalized.objective_questions.map((q: any) => {
//       let parsedTable = null;
//       if (q.table) {
//         try {
//           parsedTable = typeof q.table === 'string' ? JSON.parse(q.table) : q.table;
//         } catch (e) {
//           console.error('Failed to parse table for objective question:', q, e);
//         }
//       }

//       return {
//         ...q,
//         imageUrl: q.imageUrl || q.image || '',
//         imageAlt: q.imageAlt || q.image_alt || '',
//         table: parsedTable
//       };
//     });
//   }

//   // Normalize theory questions
//   if (normalized.theory_questions?.length > 0) {
//     normalized.theory_questions = normalized.theory_questions.map((q: any) => {
//       let parsedTable = null;
//       if (q.table) {
//         try {
//           parsedTable = typeof q.table === 'string' ? JSON.parse(q.table) : q.table;
//         } catch (e) {
//           console.error('Failed to parse table for theory question:', q, e);
//         }
//       }

//       return {
//         ...q,
//         imageUrl: q.imageUrl || q.image || '',
//         imageAlt: q.imageAlt || q.image_alt || '',
//         table: parsedTable,
//         // Normalize sub-questions
//         subQuestions: (q.subQuestions || []).map((sq: any) => {
//           let sqParsedTable = null;
//           if (sq.table) {
//             try {
//               sqParsedTable = typeof sq.table === 'string' ? JSON.parse(sq.table) : sq.table;
//             } catch (e) {
//               console.error('Failed to parse table for sub-question:', sq, e);
//             }
//           }

//           return {
//             ...sq,
//             imageUrl: sq.imageUrl || sq.image || '',
//             imageAlt: sq.imageAlt || sq.image_alt || '',
//             table: sqParsedTable,
//             // Normalize sub-sub-questions
//             subSubQuestions: (sq.subSubQuestions || []).map((ssq: any) => ({
//               ...ssq,
//               imageUrl: ssq.imageUrl || ssq.image || '',
//               imageAlt: ssq.imageAlt || ssq.image_alt || ''
//             }))
//           };
//         })
//       };
//     });
//   }

//   // Normalize practical questions
//   if (normalized.practical_questions?.length > 0) {
//     normalized.practical_questions = normalized.practical_questions.map((q: any) => {
//       let parsedTable = null;
//       if (q.table) {
//         try {
//           parsedTable = typeof q.table === 'string' ? JSON.parse(q.table) : q.table;
//         } catch (e) {
//           console.error('Failed to parse table for practical question:', q, e);
//         }
//       }

//       return {
//         ...q,
//         imageUrl: q.imageUrl || q.image || '',
//         imageAlt: q.imageAlt || q.image_alt || '',
//         table: parsedTable
//       };
//     });
//   }

//   // Normalize custom sections
//   if (normalized.custom_sections?.length > 0) {
//     normalized.custom_sections = normalized.custom_sections.map((section: any) => ({
//       ...section,
//       questions: (section.questions || []).map((q: any) => {
//         let parsedTable = null;
//         if (q.table) {
//           try {
//             parsedTable = typeof q.table === 'string' ? JSON.parse(q.table) : q.table;
//           } catch (e) {
//             console.error('Failed to parse table for custom section question:', q, e);
//           }
//         }

//         return {
//           ...q,
//           imageUrl: q.imageUrl || q.image || '',
//           imageAlt: q.imageAlt || q.image_alt || '',
//           table: parsedTable
//         };
//       })
//     }));
//   }

//   console.log('✅ Normalized exam data for edit complete');

//   return normalized;
// };

/**
 * Normalize exam data after loading from API
 * Converts unified format to teacher format for editing
 */
export const normalizeExamDataForEdit = (examData: any) => {
  const normalized = { ...examData };

  console.log('🔄 Normalizing exam data for edit:', examData);

  // CRITICAL FIX: Preserve all essential fields with multiple fallbacks
  normalized.grade_level = examData.grade_level || 
                          examData.gradeLevel || 
                          examData.grade_level_id ||
                          null;
  
  normalized.subject = examData.subject || 
                       examData.subject_id ||
                       null;
  
  normalized.max_students = examData.max_students || 
                           examData.maxStudents ||
                           null;

  // Preserve display names
  normalized.grade_level_name = examData.grade_level_name || 
                               examData.gradeLevelName || 
                               '';
  
  normalized.subject_name = examData.subject_name || 
                           examData.subjectName || 
                           '';

  // Preserve other essential fields
  normalized.exam_type = examData.exam_type || examData.examType || '';
  normalized.exam_date = examData.exam_date || examData.examDate || '';
  normalized.duration = examData.duration || 0;
  normalized.total_marks = examData.total_marks || examData.totalMarks || 0;
  normalized.instructions = examData.instructions || '';

  console.log('✅ Essential fields after normalization:', {
    grade_level: normalized.grade_level,
    subject: normalized.subject,
    max_students: normalized.max_students,
    grade_level_name: normalized.grade_level_name,
    subject_name: normalized.subject_name
  });

  // Normalize objective questions
  if (normalized.objective_questions?.length > 0) {
    normalized.objective_questions = normalized.objective_questions.map((q: any) => {
      let parsedTable = null;
      if (q.table) {
        try {
          parsedTable = typeof q.table === 'string' ? JSON.parse(q.table) : q.table;
        } catch (e) {
          console.error('Failed to parse table for objective question:', q, e);
        }
      }

      return {
        ...q,
        imageUrl: q.imageUrl || q.image || '',
        imageAlt: q.imageAlt || q.image_alt || '',
        table: parsedTable
      };
    });
  }

  // Normalize theory questions
  if (normalized.theory_questions?.length > 0) {
    normalized.theory_questions = normalized.theory_questions.map((q: any) => {
      let parsedTable = null;
      if (q.table) {
        try {
          parsedTable = typeof q.table === 'string' ? JSON.parse(q.table) : q.table;
        } catch (e) {
          console.error('Failed to parse table for theory question:', q, e);
        }
      }

      return {
        ...q,
        imageUrl: q.imageUrl || q.image || '',
        imageAlt: q.imageAlt || q.image_alt || '',
        table: parsedTable,
        // Normalize sub-questions
        subQuestions: (q.subQuestions || []).map((sq: any) => {
          let sqParsedTable = null;
          if (sq.table) {
            try {
              sqParsedTable = typeof sq.table === 'string' ? JSON.parse(sq.table) : sq.table;
            } catch (e) {
              console.error('Failed to parse table for sub-question:', sq, e);
            }
          }

          return {
            ...sq,
            imageUrl: sq.imageUrl || sq.image || '',
            imageAlt: sq.imageAlt || sq.image_alt || '',
            table: sqParsedTable,
            // Normalize sub-sub-questions
            subSubQuestions: (sq.subSubQuestions || []).map((ssq: any) => ({
              ...ssq,
              imageUrl: ssq.imageUrl || ssq.image || '',
              imageAlt: ssq.imageAlt || ssq.image_alt || ''
            }))
          };
        })
      };
    });
  }

  // Normalize practical questions
  if (normalized.practical_questions?.length > 0) {
    normalized.practical_questions = normalized.practical_questions.map((q: any) => {
      let parsedTable = null;
      if (q.table) {
        try {
          parsedTable = typeof q.table === 'string' ? JSON.parse(q.table) : q.table;
        } catch (e) {
          console.error('Failed to parse table for practical question:', q, e);
        }
      }

      return {
        ...q,
        imageUrl: q.imageUrl || q.image || '',
        imageAlt: q.imageAlt || q.image_alt || '',
        table: parsedTable
      };
    });
  }

  // Normalize custom sections
  if (normalized.custom_sections?.length > 0) {
    normalized.custom_sections = normalized.custom_sections.map((section: any) => ({
      ...section,
      questions: (section.questions || []).map((q: any) => {
        let parsedTable = null;
        if (q.table) {
          try {
            parsedTable = typeof q.table === 'string' ? JSON.parse(q.table) : q.table;
          } catch (e) {
            console.error('Failed to parse table for custom section question:', q, e);
          }
        }

        return {
          ...q,
          imageUrl: q.imageUrl || q.image || '',
          imageAlt: q.imageAlt || q.image_alt || '',
          table: parsedTable
        };
      })
    }));
  }

  console.log('✅ Normalized exam data for edit complete');

  return normalized;
};

/**
 * Convert table data (array or object) to HTML table string
 */
function convertTableToHtml(tableData: any): string {
  if (!tableData) return '';

  // If it's already a string (HTML), return as-is
  if (typeof tableData === 'string') {
    // Check if it already contains HTML table tags
    if (tableData.includes('<table')) {
      return tableData;
    }
    // Otherwise, try to parse as JSON
    try {
      tableData = JSON.parse(tableData);
    } catch {
      // If parsing fails, wrap in a simple table
      return `<table style="border-collapse: collapse; width: 100%; margin: 10px 0; border: 1px solid #ddd;">
        <tbody>
          <tr>
            <td style="border: 1px solid #ddd; padding: 8px;">${tableData}</td>
          </tr>
        </tbody>
      </table>`;
    }
  }

  try {
    // Handle array of arrays (rows and columns)
    if (Array.isArray(tableData)) {
      if (tableData.length === 0) return '';

      // Check if first element is an array (matrix format)
      if (Array.isArray(tableData[0])) {
        const headers = tableData[0];
        const rows = tableData.slice(1);

        let html = '<table style="border-collapse: collapse; width: 100%; margin: 10px 0; border: 1px solid #ddd;">';
        
        // Add header row
        html += '<thead><tr>';
        headers.forEach((header: any) => {
          html += `<th style="border: 1px solid #ddd; padding: 8px; background-color: #f0f0f0; text-align: left; font-weight: bold;">${header || ''}</th>`;
        });
        html += '</tr></thead>';

        // Add body rows
        html += '<tbody>';
        rows.forEach((row: any[]) => {
          html += '<tr>';
          row.forEach((cell: any) => {
            html += `<td style="border: 1px solid #ddd; padding: 8px; text-align: left;">${cell || ''}</td>`;
          });
          html += '</tr>';
        });
        html += '</tbody></table>';

        return html;
      } else {
        // Array of objects - first object keys become headers
        if (tableData.length > 0 && typeof tableData[0] === 'object') {
          const headers = Object.keys(tableData[0]);
          
          let html = '<table style="border-collapse: collapse; width: 100%; margin: 10px 0; border: 1px solid #ddd;">';
          
          html += '<thead><tr>';
          headers.forEach(header => {
            html += `<th style="border: 1px solid #ddd; padding: 8px; background-color: #f0f0f0; text-align: left; font-weight: bold;">${header}</th>`;
          });
          html += '</tr></thead>';

          html += '<tbody>';
          tableData.forEach((row: any) => {
            html += '<tr>';
            headers.forEach(header => {
              html += `<td style="border: 1px solid #ddd; padding: 8px; text-align: left;">${row[header] || ''}</td>`;
            });
            html += '</tr>';
          });
          html += '</tbody></table>';

          return html;
        }
      }
    }

    // Handle object with headers and rows properties
    if (tableData.headers && tableData.rows) {
      let html = '<table style="border-collapse: collapse; width: 100%; margin: 10px 0; border: 1px solid #ddd;">';
      
      html += '<thead><tr>';
      tableData.headers.forEach((header: any) => {
        html += `<th style="border: 1px solid #ddd; padding: 8px; background-color: #f0f0f0; text-align: left; font-weight: bold;">${header}</th>`;
      });
      html += '</tr></thead>';

      html += '<tbody>';
      tableData.rows.forEach((row: any[]) => {
        html += '<tr>';
        row.forEach((cell: any) => {
          html += `<td style="border: 1px solid #ddd; padding: 8px; text-align: left;">${cell || ''}</td>`;
        });
        html += '</tr>';
      });
      html += '</tbody></table>';

      return html;
    }

    // Handle generic object (convert to key-value table)
    const entries = Object.entries(tableData);
    if (entries.length === 0) return '';

    let html = '<table style="border-collapse: collapse; width: 100%; margin: 10px 0; border: 1px solid #ddd;">';
    html += '<tbody>';
    entries.forEach(([key, value]) => {
      html += '<tr>';
      html += `<th style="border: 1px solid #ddd; padding: 8px; background-color: #f0f0f0; text-align: left; font-weight: bold;">${key}</th>`;
      html += `<td style="border: 1px solid #ddd; padding: 8px; text-align: left;">${value}</td>`;
      html += '</tr>';
    });
    html += '</tbody></table>';

    return html;
  } catch (error) {
    console.error('❌ Error converting table to HTML:', error, tableData);
    return '';
  }
}

/**
 * Normalize exam data specifically for PDF generation
 *
 * This is the dedicated entry point for PDF generation that ensures:
 * - All plain text is converted to HTML
 * - Images from both Admin (inline) and Teacher (separate fields) are handled
 * - Tables in all formats (JSON, arrays, objects, HTML) are converted to HTML
 * - Content is optimized for print-ready PDF output
 *
 * @param examData - Raw exam data from API
 * @returns Normalized exam data ready for PDF generation
 */
export const normalizeForPdfGeneration = (examData: any) => {
  console.group('📄 Normalizing exam data for PDF generation');
  console.log('Input exam data:', examData);

  // Use the existing normalizeExamDataForDisplay as the base
  // It already handles all the requirements from EXAM-002:
  // 1. Plain text → HTML conversion (ensureHtmlFormat)
  // 2. Image handling (inline HTML + separate fields)
  // 3. Table conversion (all formats → HTML)
  // 4. Consistent styling and formatting
  const normalized = normalizeExamDataForDisplay(examData);

  console.log('✅ PDF normalization complete');
  console.groupEnd();

  return normalized;
};

/**
 * Normalize exam data for display (view modal and print)
 *
 * UPDATED: HTML-First Approach
 * - Question content with embedded images/tables is preserved from RichTextEditor HTML
 * - Backward compatibility: Legacy separate image/table fields are still rendered if present
 * - Ensures all question text is in HTML format for consistent rendering
 */
export const normalizeExamDataForDisplay = (examData: any) => {
  if (!examData) return null;

  const normalized = { ...examData };

  console.group('🔄 Normalizing exam data for display (HTML-first)');
  console.log('Input exam data:', examData);

  // Helper to normalize a single question for display
  const normalizeQuestion = (q: any, questionType: string = 'unknown') => {
    const result = { ...q };

    // Normalize question text - ensure HTML format
    const rawQuestion = q.question || q.question_text || q.questionText || q.text || '';
    result.question = ensureHtmlFormat(rawQuestion);

    // BACKWARD COMPATIBILITY: Handle legacy separate image fields if they exist
    // Modern approach: Images are embedded in question HTML via RichTextEditor
    if (q.image || q.imageUrl || q.image_url || q.imageURL || q.question_image) {
      result.image =
        q.image ||
        q.imageUrl ||
        q.image_url ||
        q.imageURL ||
        q.question_image ||
        null;

      // If image is an object, extract URL
      if (result.image && typeof result.image === 'object') {
        result.image = result.image.url || result.image.src || result.image.path || null;
      }

      // Ensure it's a valid URL string
      if (result.image && typeof result.image !== 'string') {
        console.warn(`⚠️ Invalid image format for ${questionType}:`, result.image);
        result.image = null;
      }

      if (result.image) {
        console.log(`✅ Legacy image field found for ${questionType}:`, result.image.substring(0, 100));
      }
    }

    // BACKWARD COMPATIBILITY: Handle legacy separate table fields if they exist
    // Modern approach: Tables are embedded in question HTML via RichTextEditor
    if (q.table) {
      console.log(`🔍 Processing legacy table for ${questionType}:`, typeof q.table);

      let tableData = q.table;
      if (typeof tableData === 'string') {
        // Check if it's already HTML
        if (tableData.includes('<table')) {
          console.log(`✅ Table is already HTML for ${questionType}`);
          result.table = tableData;
        } else {
          // Try to parse as JSON
          try {
            tableData = JSON.parse(tableData);
            result.table = convertTableToHtml(tableData);
            console.log(`✅ Converted legacy table JSON to HTML for ${questionType}`);
          } catch (e) {
            // Treat as plain text, wrap in simple table
            result.table = convertTableToHtml(tableData);
          }
        }
      } else if (typeof tableData === 'object') {
        // Convert object to HTML table
        result.table = convertTableToHtml(tableData);
        console.log(`✅ Converted legacy table object to HTML for ${questionType}`);
      } else {
        console.warn(`⚠️ Unknown table format for ${questionType}:`, typeof tableData);
        result.table = null;
      }
    }

    return result;
  };

  // Normalize all question types
  if (normalized.objective_questions?.length > 0) {
    console.log(`📊 Processing ${normalized.objective_questions.length} objective questions`);
    normalized.objective_questions = normalized.objective_questions.map((q: any, idx: number) =>
      normalizeQuestion(q, `objective-${idx + 1}`)
    );
  }

  if (normalized.theory_questions?.length > 0) {
    console.log(`📝 Processing ${normalized.theory_questions.length} theory questions`);
    normalized.theory_questions = normalized.theory_questions.map((q: any, idx: number) => {
      const normalizedQ = normalizeQuestion(q, `theory-${idx + 1}`);

      // Normalize sub-questions
      if (normalizedQ.subQuestions?.length > 0) {
        console.log(`  └─ Processing ${normalizedQ.subQuestions.length} sub-questions`);
        normalizedQ.subQuestions = normalizedQ.subQuestions.map((sq: any, sqIdx: number) => {
          const normalizedSq = normalizeQuestion(sq, `theory-${idx + 1}-sub-${sqIdx + 1}`);

          // Normalize sub-sub-questions
          if (normalizedSq.subSubQuestions?.length > 0) {
            console.log(`    └─ Processing ${normalizedSq.subSubQuestions.length} sub-sub-questions`);
            normalizedSq.subSubQuestions = normalizedSq.subSubQuestions.map((ssq: any, ssqIdx: number) =>
              normalizeQuestion(ssq, `theory-${idx + 1}-sub-${sqIdx + 1}-subsub-${ssqIdx + 1}`)
            );
          }

          return normalizedSq;
        });
      }

      return normalizedQ;
    });
  }

  if (normalized.practical_questions?.length > 0) {
    console.log(`🔬 Processing ${normalized.practical_questions.length} practical questions`);
    normalized.practical_questions = normalized.practical_questions.map((q: any, idx: number) =>
      normalizeQuestion(q, `practical-${idx + 1}`)
    );
  }

  if (normalized.custom_sections?.length > 0) {
    console.log(`📑 Processing ${normalized.custom_sections.length} custom sections`);
    normalized.custom_sections = normalized.custom_sections.map((section: any, sIdx: number) => ({
      ...section,
      questions: (section.questions || []).map((q: any, qIdx: number) =>
        normalizeQuestion(q, `custom-${sIdx + 1}-${qIdx + 1}`)
      )
    }));
  }

  // Count legacy images and tables for verification (embedded content is in question HTML)
  const legacyImageCount = [
    ...(normalized.objective_questions || []),
    ...(normalized.theory_questions || []),
    ...(normalized.practical_questions || []),
    ...(normalized.custom_sections?.flatMap((s: any) => s.questions || []) || [])
  ].filter(q => q.image).length;

  const legacyTableCount = [
    ...(normalized.objective_questions || []),
    ...(normalized.theory_questions || []),
    ...(normalized.practical_questions || []),
    ...(normalized.custom_sections?.flatMap((s: any) => s.questions || []) || [])
  ].filter(q => q.table).length;

  console.log('✅ Normalized exam data for display complete:', {
    legacyImages: legacyImageCount,
    legacyTables: legacyTableCount,
    note: 'Modern exams have images/tables embedded in question HTML',
    objective: normalized.objective_questions?.length || 0,
    theory: normalized.theory_questions?.length || 0,
    practical: normalized.practical_questions?.length || 0,
    custom: normalized.custom_sections?.length || 0
  });
  console.groupEnd();

  return normalized;
};