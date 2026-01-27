/**
 * Shared Rich Text Editor for Exam Questions
 *
 * A Tiptap-based editor with:
 * - Text formatting (bold, italic, underline, strikethrough)
 * - Headings and lists
 * - Tables with CRUD operations
 * - Image upload via Cloudinary (not just URL)
 * - Shapes and symbols
 *
 * Used by both Admin and Teacher exam forms for consistent data format.
 */

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';
import Underline from '@tiptap/extension-underline';
import { uploadImageToCloudinary } from './ImageUploader';
import type { RichTextEditorProps } from './types';

// Shape/symbol options
const SHAPES = [
  { label: 'Circle', symbol: '●' },
  { label: 'Square', symbol: '■' },
  { label: 'Triangle', symbol: '▲' },
  { label: 'Diamond', symbol: '◆' },
  { label: 'Star', symbol: '★' },
  { label: 'Heart', symbol: '♥' },
  { label: 'Arrow Right', symbol: '→' },
  { label: 'Arrow Left', symbol: '←' },
  { label: 'Arrow Up', symbol: '↑' },
  { label: 'Arrow Down', symbol: '↓' },
  { label: 'Check', symbol: '✓' },
  { label: 'Cross', symbol: '✗' },
  { label: 'Circle Outline', symbol: '○' },
  { label: 'Square Outline', symbol: '□' },
  { label: 'Triangle Outline', symbol: '△' },
  { label: 'Pentagon', symbol: '⬟' },
];

interface MenuBarProps {
  editor: any;
  enableImageUpload?: boolean;
  enableTables?: boolean;
  simplified?: boolean;
}

const MenuBar: React.FC<MenuBarProps> = ({
  editor,
  enableImageUpload = true,
  enableTables = true,
  simplified = false,
}) => {
  const [showShapes, setShowShapes] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!editor) return null;

  const isTableActive = editor.isActive('table');

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const result = await uploadImageToCloudinary(file);
      editor.chain().focus().setImage({ src: result.url }).run();
    } catch (error) {
      console.error('Image upload failed:', error);
      // Fallback to URL prompt
      const url = prompt('Image upload failed. Enter image URL instead:');
      if (url) editor.chain().focus().setImage({ src: url }).run();
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const insertShape = (symbol: string) => {
    editor.chain().focus().insertContent(symbol).run();
    setShowShapes(false);
  };

  const buttonClass = (isActive: boolean) =>
    `px-3 py-1 rounded text-sm font-medium transition ${
      isActive
        ? 'bg-blue-600 text-white'
        : 'bg-white text-gray-700 hover:bg-gray-200'
    }`;

  const divider = <div className="w-px h-6 bg-gray-300 mx-1" />;

  return (
    <div className="bg-gray-100 border-b border-gray-300 p-2 flex flex-wrap gap-1 rounded-t-lg relative">
      {/* Text Formatting */}
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBold().run()}
        disabled={!editor.can().chain().focus().toggleBold().run()}
        className={buttonClass(editor.isActive('bold'))}
        title="Bold (Ctrl+B)"
      >
        <strong>B</strong>
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleItalic().run()}
        disabled={!editor.can().chain().focus().toggleItalic().run()}
        className={buttonClass(editor.isActive('italic'))}
        title="Italic (Ctrl+I)"
      >
        <em>I</em>
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        className={buttonClass(editor.isActive('underline'))}
        title="Underline (Ctrl+U)"
      >
        <u>U</u>
      </button>

      {!simplified && (
        <>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleStrike().run()}
            disabled={!editor.can().chain().focus().toggleStrike().run()}
            className={buttonClass(editor.isActive('strike'))}
            title="Strikethrough"
          >
            <s>S</s>
          </button>

          {divider}

          {/* Headings */}
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            className={buttonClass(editor.isActive('heading', { level: 1 }))}
            title="Heading 1"
          >
            H1
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            className={buttonClass(editor.isActive('heading', { level: 2 }))}
            title="Heading 2"
          >
            H2
          </button>
        </>
      )}

      {divider}

      {/* Lists */}
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        className={buttonClass(editor.isActive('bulletList'))}
        title="Bullet List"
      >
        • List
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        className={buttonClass(editor.isActive('orderedList'))}
        title="Numbered List"
      >
        1. List
      </button>

      {!simplified && (
        <>
          {divider}

          {/* Code Block & Quote */}
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
            className={buttonClass(editor.isActive('codeBlock'))}
            title="Code Block"
          >
            {'</>'}
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            className={buttonClass(editor.isActive('blockquote'))}
            title="Blockquote"
          >
            ❝ Quote
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
            className="px-3 py-1 rounded text-sm font-medium bg-white text-gray-700 hover:bg-gray-200 transition"
            title="Horizontal Rule"
          >
            ― HR
          </button>
        </>
      )}

      {divider}

      {/* Table Controls */}
      {enableTables && (
        <>
          {!isTableActive ? (
            <button
              type="button"
              onClick={() =>
                editor
                  .chain()
                  .focus()
                  .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
                  .run()
              }
              className="px-3 py-1 rounded text-sm font-medium bg-white text-gray-700 hover:bg-gray-200 transition"
              title="Insert Table"
            >
              ⊞ Table
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => editor.chain().focus().addColumnBefore().run()}
                className="px-2 py-1 rounded text-xs font-medium bg-white text-gray-700 hover:bg-gray-200 transition"
                title="Add Column Before"
              >
                ←Col
              </button>
              <button
                type="button"
                onClick={() => editor.chain().focus().addColumnAfter().run()}
                className="px-2 py-1 rounded text-xs font-medium bg-white text-gray-700 hover:bg-gray-200 transition"
                title="Add Column After"
              >
                Col→
              </button>
              <button
                type="button"
                onClick={() => editor.chain().focus().deleteColumn().run()}
                className="px-2 py-1 rounded text-xs font-medium bg-red-100 text-red-700 hover:bg-red-200 transition"
                title="Delete Column"
              >
                ✕Col
              </button>
              <button
                type="button"
                onClick={() => editor.chain().focus().addRowBefore().run()}
                className="px-2 py-1 rounded text-xs font-medium bg-white text-gray-700 hover:bg-gray-200 transition"
                title="Add Row Before"
              >
                ↑Row
              </button>
              <button
                type="button"
                onClick={() => editor.chain().focus().addRowAfter().run()}
                className="px-2 py-1 rounded text-xs font-medium bg-white text-gray-700 hover:bg-gray-200 transition"
                title="Add Row After"
              >
                Row↓
              </button>
              <button
                type="button"
                onClick={() => editor.chain().focus().deleteRow().run()}
                className="px-2 py-1 rounded text-xs font-medium bg-red-100 text-red-700 hover:bg-red-200 transition"
                title="Delete Row"
              >
                ✕Row
              </button>
              <button
                type="button"
                onClick={() => editor.chain().focus().deleteTable().run()}
                className="px-2 py-1 rounded text-xs font-medium bg-red-600 text-white hover:bg-red-700 transition"
                title="Delete Table"
              >
                ✕Table
              </button>
            </>
          )}
          {divider}
        </>
      )}

      {/* Image - with file upload support */}
      {enableImageUpload ? (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="px-3 py-1 rounded text-sm font-medium bg-white text-gray-700 hover:bg-gray-200 transition disabled:opacity-50"
            title="Upload Image"
          >
            {uploading ? '⏳ Uploading...' : '📤 Upload'}
          </button>
          <button
            type="button"
            onClick={() => {
              const url = prompt('Enter image URL:');
              if (url) editor.chain().focus().setImage({ src: url }).run();
            }}
            className="px-3 py-1 rounded text-sm font-medium bg-white text-gray-700 hover:bg-gray-200 transition"
            title="Insert Image URL"
          >
            🖼️ URL
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => {
            const url = prompt('Enter image URL:');
            if (url) editor.chain().focus().setImage({ src: url }).run();
          }}
          className="px-3 py-1 rounded text-sm font-medium bg-white text-gray-700 hover:bg-gray-200 transition"
          title="Insert Image"
        >
          🖼️ Image
        </button>
      )}

      {/* Link */}
      <button
        type="button"
        onClick={() => {
          const url = prompt('Enter URL:');
          if (url) editor.chain().focus().setLink({ href: url }).run();
        }}
        className={buttonClass(editor.isActive('link'))}
        title="Insert Link"
      >
        🔗 Link
      </button>

      {!simplified && (
        <>
          {/* Shapes/Symbols */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowShapes(!showShapes)}
              className="px-3 py-1 rounded text-sm font-medium bg-white text-gray-700 hover:bg-gray-200 transition"
              title="Insert Shape/Symbol"
            >
              ◆ Shapes
            </button>
            {showShapes && (
              <div className="absolute top-full left-0 mt-1 bg-white border border-gray-300 rounded shadow-lg p-2 z-10 grid grid-cols-4 gap-1 max-h-64 overflow-y-auto">
                {SHAPES.map((shape) => (
                  <button
                    type="button"
                    key={shape.label}
                    onClick={() => insertShape(shape.symbol)}
                    className="px-3 py-2 text-2xl hover:bg-blue-100 rounded transition"
                    title={shape.label}
                  >
                    {shape.symbol}
                  </button>
                ))}
              </div>
            )}
          </div>

          {divider}

          {/* Clear Formatting */}
          <button
            type="button"
            onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()}
            className="px-3 py-1 rounded text-sm font-medium bg-white text-gray-700 hover:bg-gray-200 transition"
            title="Clear Formatting"
          >
            Clear
          </button>
        </>
      )}
    </div>
  );
};

/**
 * RichTextEditor Component
 *
 * A full-featured rich text editor for exam questions.
 */
const RichTextEditor: React.FC<RichTextEditorProps> = ({
  value,
  onChange,
  placeholder = 'Enter text...',
  readOnly = false,
  enableImageUpload = true,
  enableTables = true,
  minHeight = 150,
  maxHeight,
  className = '',
  simplified = false,
}) => {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-blue-600 underline hover:text-blue-800',
        },
      }),
      Image.configure({
        HTMLAttributes: {
          class: 'max-w-full h-auto rounded my-2',
        },
      }),
      Table.configure({
        resizable: true,
        HTMLAttributes: {
          class: 'border-collapse table-auto w-full my-4',
        },
      }),
      TableRow.configure({
        HTMLAttributes: {
          class: 'border border-gray-300',
        },
      }),
      TableHeader.configure({
        HTMLAttributes: {
          class: 'border border-gray-300 bg-gray-100 px-4 py-2 text-left font-semibold',
        },
      }),
      TableCell.configure({
        HTMLAttributes: {
          class: 'border border-gray-300 px-4 py-2',
        },
      }),
    ],
    content: value,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editable: !readOnly,
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none focus:outline-none',
      },
    },
  });

  // Update editor content when value changes externally
  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value);
    }
  }, [editor, value]);

  // Close shapes dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      // This is handled within MenuBar component
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const editorStyle: React.CSSProperties = {
    minHeight: `${minHeight}px`,
    ...(maxHeight ? { maxHeight: `${maxHeight}px`, overflowY: 'auto' } : {}),
  };

  return (
    <div className={`border border-gray-300 rounded-lg overflow-hidden shadow-sm ${className}`}>
      {!readOnly && (
        <MenuBar
          editor={editor}
          enableImageUpload={enableImageUpload}
          enableTables={enableTables}
          simplified={simplified}
        />
      )}
      <EditorContent
        editor={editor}
        className="px-4 py-3 bg-white focus-within:bg-gray-50"
        style={editorStyle}
      />
      {!readOnly && (
        <div className="bg-gray-50 border-t border-gray-300 px-4 py-2 text-xs text-gray-500">
          {placeholder}
        </div>
      )}
    </div>
  );
};

export default RichTextEditor;
