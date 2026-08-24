/**
 * Shared Rich Text Editor for Exam Questions
 *
 * A Tiptap-based editor with:
 * - Text formatting (bold, italic, underline, strikethrough)
 * - Headings and lists
 * - Tables with CRUD operations
 * - Image upload via Cloudinary
 * - Image editing: resize, crop, background removal (click any image to edit)
 * - Shapes and symbols
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
import ImageEditModal from './ImageEditModal';
import ShapePanel from './ShapePanel';
import type { RichTextEditorProps } from './types';

// Shapes are now handled by ShapePanel.tsx (SVG-based, fully configurable)

// ─── Image floating toolbar ────────────────────────────────────────────────────

interface ImageFloatToolbarProps {
  position: { top: number; left: number };
  onResize: (pct: number) => void;
  onEdit: () => void;
  onDelete: () => void;
}

const SIZE_OPTIONS = [
  { label: 'S', pct: 25, title: 'Small (25%)' },
  { label: 'M', pct: 50, title: 'Medium (50%)' },
  { label: 'L', pct: 75, title: 'Large (75%)' },
  { label: '↔', pct: 100, title: 'Full width' },
];

const ImageFloatToolbar: React.FC<ImageFloatToolbarProps> = ({
  position, onResize, onEdit, onDelete,
}) => (
  <div
    style={{
      position: 'absolute',
      top: position.top,
      left: position.left,
      zIndex: 50,
      transform: 'translateY(-110%)',
    }}
    className="flex items-center gap-1 bg-gray-900 text-white text-xs rounded-lg px-2 py-1.5 shadow-xl select-none"
    onMouseDown={e => e.preventDefault()}  // don't steal focus from editor
  >
    {/* Resize */}
    <span className="text-gray-400 mr-1 text-[10px]">Size:</span>
    {SIZE_OPTIONS.map(o => (
      <button
        key={o.pct}
        type="button"
        onClick={() => onResize(o.pct)}
        title={o.title}
        className="px-1.5 py-0.5 rounded hover:bg-gray-700 font-medium transition-colors"
      >
        {o.label}
      </button>
    ))}

    <div className="w-px h-4 bg-gray-600 mx-1" />

    {/* Edit (crop / bg removal) */}
    <button
      type="button"
      onClick={onEdit}
      title="Crop / Remove background"
      className="flex items-center gap-1 px-2 py-0.5 rounded hover:bg-blue-600 transition-colors"
    >
      ✏️ Edit
    </button>

    <div className="w-px h-4 bg-gray-600 mx-0.5" />

    {/* Delete */}
    <button
      type="button"
      onClick={onDelete}
      title="Remove image"
      className="px-1.5 py-0.5 rounded hover:bg-red-600 transition-colors"
    >
      🗑
    </button>
  </div>
);

// ─── MenuBar ──────────────────────────────────────────────────────────────────

interface MenuBarProps {
  editor: any;
  enableImageUpload?: boolean;
  enableTables?: boolean;
  simplified?: boolean;
  onImageUploaded: (url: string) => void;
}

const MenuBar: React.FC<MenuBarProps> = ({
  editor, enableImageUpload = true, enableTables = true,
  simplified = false, onImageUploaded,
}) => {
  const [showShapePanel, setShowShapePanel] = useState(false);
  const [uploading,      setUploading]      = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!editor) return null;

  const isTableActive = editor.isActive('table');

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const result = await uploadImageToCloudinary(file);
      editor.chain().focus().setImage({ src: result.url, width: '75%' }).run();
      onImageUploaded(result.url);
    } catch (err: any) {
      alert(`Image upload failed: ${err?.message || 'Unknown error'}. Please try again.`);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const btn = (active: boolean) =>
    `px-3 py-1 rounded text-sm font-medium transition ${
      active ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-200'
    }`;

  const div = <div className="w-px h-6 bg-gray-300 mx-1" />;

  return (
    <div className="bg-gray-100 border-b border-gray-300 p-2 flex flex-wrap gap-1 rounded-t-lg relative">
      {/* Text formatting */}
      <button type="button" onClick={() => editor.chain().focus().toggleBold().run()}
        className={btn(editor.isActive('bold'))} title="Bold"><strong>B</strong></button>
      <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()}
        className={btn(editor.isActive('italic'))} title="Italic"><em>I</em></button>
      <button type="button" onClick={() => editor.chain().focus().toggleUnderline().run()}
        className={btn(editor.isActive('underline'))} title="Underline"><u>U</u></button>

      {!simplified && (
        <>
          <button type="button" onClick={() => editor.chain().focus().toggleStrike().run()}
            className={btn(editor.isActive('strike'))} title="Strikethrough"><s>S</s></button>
          {div}
          <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            className={btn(editor.isActive('heading', { level: 1 }))} title="Heading 1">H1</button>
          <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            className={btn(editor.isActive('heading', { level: 2 }))} title="Heading 2">H2</button>
        </>
      )}

      {div}

      {/* Lists */}
      <button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()}
        className={btn(editor.isActive('bulletList'))} title="Bullet List">• List</button>
      <button type="button" onClick={() => editor.chain().focus().toggleOrderedList().run()}
        className={btn(editor.isActive('orderedList'))} title="Numbered List">1. List</button>

      {!simplified && (
        <>
          {div}
          <button type="button" onClick={() => editor.chain().focus().toggleCodeBlock().run()}
            className={btn(editor.isActive('codeBlock'))} title="Code Block">{'</>'}</button>
          <button type="button" onClick={() => editor.chain().focus().toggleBlockquote().run()}
            className={btn(editor.isActive('blockquote'))} title="Blockquote">❝ Quote</button>
          <button type="button" onClick={() => editor.chain().focus().setHorizontalRule().run()}
            className="px-3 py-1 rounded text-sm font-medium bg-white text-gray-700 hover:bg-gray-200 transition"
            title="Horizontal Rule">― HR</button>
        </>
      )}

      {div}

      {/* Table */}
      {enableTables && (
        <>
          {!isTableActive ? (
            <button type="button"
              onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 4, withHeaderRow: true }).run()}
              className="px-3 py-1 rounded text-sm font-medium bg-white text-gray-700 hover:bg-gray-200 transition"
              title="Insert 3×4 table with header row">
              ⊞ Table
            </button>
          ) : (
            <div className="flex flex-wrap gap-0.5 items-center bg-blue-50 border border-blue-200 rounded-lg px-1.5 py-0.5">
              {/* Column controls */}
              <span className="text-[10px] text-blue-500 font-semibold mr-0.5">Col:</span>
              <button type="button" onClick={() => editor.chain().focus().addColumnBefore().run()}
                className="px-1.5 py-0.5 rounded text-xs font-medium bg-white text-gray-600 hover:bg-gray-100 border border-gray-200 transition"
                title="Add column before">+ ←</button>
              <button type="button" onClick={() => editor.chain().focus().addColumnAfter().run()}
                className="px-1.5 py-0.5 rounded text-xs font-medium bg-white text-gray-600 hover:bg-gray-100 border border-gray-200 transition"
                title="Add column after">→ +</button>
              <button type="button" onClick={() => editor.chain().focus().deleteColumn().run()}
                className="px-1.5 py-0.5 rounded text-xs font-medium bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 transition"
                title="Delete column">✕Col</button>

              <div className="w-px h-4 bg-blue-200 mx-0.5" />

              {/* Row controls */}
              <span className="text-[10px] text-blue-500 font-semibold mr-0.5">Row:</span>
              <button type="button" onClick={() => editor.chain().focus().addRowBefore().run()}
                className="px-1.5 py-0.5 rounded text-xs font-medium bg-white text-gray-600 hover:bg-gray-100 border border-gray-200 transition"
                title="Add row above">+ ↑</button>
              <button type="button" onClick={() => editor.chain().focus().addRowAfter().run()}
                className="px-1.5 py-0.5 rounded text-xs font-medium bg-white text-gray-600 hover:bg-gray-100 border border-gray-200 transition"
                title="Add row below">↓ +</button>
              <button type="button" onClick={() => editor.chain().focus().deleteRow().run()}
                className="px-1.5 py-0.5 rounded text-xs font-medium bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 transition"
                title="Delete row">✕Row</button>

              <div className="w-px h-4 bg-blue-200 mx-0.5" />

              {/* Cell controls */}
              <span className="text-[10px] text-blue-500 font-semibold mr-0.5">Cell:</span>
              <button type="button"
                onClick={() => { try { editor.chain().focus().mergeCells().run(); } catch {} }}
                className="px-1.5 py-0.5 rounded text-xs font-medium bg-white text-gray-600 hover:bg-gray-100 border border-gray-200 transition"
                title="Merge selected cells">Merge</button>
              <button type="button"
                onClick={() => { try { editor.chain().focus().splitCell().run(); } catch {} }}
                className="px-1.5 py-0.5 rounded text-xs font-medium bg-white text-gray-600 hover:bg-gray-100 border border-gray-200 transition"
                title="Split merged cell">Split</button>
              <button type="button"
                onClick={() => editor.chain().focus().toggleHeaderRow().run()}
                className="px-1.5 py-0.5 rounded text-xs font-medium bg-white text-gray-600 hover:bg-gray-100 border border-gray-200 transition"
                title="Toggle header row">H-Row</button>
              <button type="button"
                onClick={() => editor.chain().focus().toggleHeaderColumn().run()}
                className="px-1.5 py-0.5 rounded text-xs font-medium bg-white text-gray-600 hover:bg-gray-100 border border-gray-200 transition"
                title="Toggle header column">H-Col</button>

              <div className="w-px h-4 bg-blue-200 mx-0.5" />

              <button type="button" onClick={() => editor.chain().focus().deleteTable().run()}
                className="px-1.5 py-0.5 rounded text-xs font-medium bg-red-600 text-white hover:bg-red-700 transition"
                title="Delete table">✕ Table</button>
            </div>
          )}
          {div}
        </>
      )}

      {/* Image upload */}
      {enableImageUpload ? (
        <>
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading}
            className="px-3 py-1 rounded text-sm font-medium bg-white text-gray-700 hover:bg-gray-200 transition disabled:opacity-50"
            title="Upload Image — click image in editor to resize/crop/remove background">
            {uploading ? '⏳ Uploading…' : '📤 Upload'}
          </button>
          <button type="button"
            onClick={() => {
            const url = prompt('Enter image URL:');
            if (url) editor.chain().focus().setImage({ src: url, width: '75%' }).run();
          }}
            className="px-3 py-1 rounded text-sm font-medium bg-white text-gray-700 hover:bg-gray-200 transition"
            title="Insert Image by URL">🖼️ URL</button>
        </>
      ) : (
        <button type="button"
          onClick={() => {
            const url = prompt('Enter image URL:');
            if (url) editor.chain().focus().setImage({ src: url, width: '75%' }).run();
          }}
          className="px-3 py-1 rounded text-sm font-medium bg-white text-gray-700 hover:bg-gray-200 transition">🖼️ Image</button>
      )}

      {/* Link */}
      <button type="button"
        onClick={() => { const url = prompt('Enter URL:'); if (url) editor.chain().focus().setLink({ href: url }).run(); }}
        className={btn(editor.isActive('link'))} title="Insert Link">🔗 Link</button>

      {!simplified && (
        <>
          {/* Shape Designer */}
          <div className="relative">
            <button type="button"
              onClick={() => setShowShapePanel(p => !p)}
              className={`px-3 py-1 rounded text-sm font-medium transition ${
                showShapePanel ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-200'
              }`}
              title="Open Shape Designer — 30+ shapes with full colour and size control">
              ◆ Shapes
            </button>
            {showShapePanel && (
              <ShapePanel
                onClose={() => setShowShapePanel(false)}
                onInsert={(dataUrl, label, size) => {
                  editor.chain().focus().setImage({
                    src: dataUrl,
                    alt: label,
                    // Start at the configured size; user can drag-resize via the toolbar
                    width: String(size),
                  }).run();
                  setShowShapePanel(false);
                }}
              />
            )}
          </div>
          {div}
          <button type="button"
            onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()}
            className="px-3 py-1 rounded text-sm font-medium bg-white text-gray-700 hover:bg-gray-200 transition">Clear</button>
        </>
      )}
    </div>
  );
};

// ─── Main RichTextEditor ──────────────────────────────────────────────────────

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
  const containerRef = useRef<HTMLDivElement>(null);

  // ── Image edit state ────────────────────────────────────────────────────────
  const [selectedImg, setSelectedImg]     = useState<HTMLImageElement | null>(null);
  const [toolbarPos,  setToolbarPos]      = useState<{ top: number; left: number } | null>(null);
  const [editModalSrc, setEditModalSrc]  = useState<string | null>(null);

  const editor = useEditor({
    extensions: [
      // StarterKit v3 includes Link and Underline by default.
      // Disable them here so we can add our own configured versions below.
      StarterKit.configure({ link: false, underline: false }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: 'text-blue-600 underline hover:text-blue-800' },
      }),
      Image.configure({
        HTMLAttributes: { class: 'inline-block max-w-full h-auto rounded my-2 cursor-pointer' },
        allowBase64: true,
      }),
      Table.configure({ resizable: true, HTMLAttributes: { class: 'border-collapse table-auto w-full my-4' } }),
      TableRow.configure({ HTMLAttributes: { class: 'border border-gray-300' } }),
      TableHeader.configure({ HTMLAttributes: { class: 'border border-gray-300 bg-gray-100 px-4 py-2 text-left font-semibold' } }),
      TableCell.configure({ HTMLAttributes: { class: 'border border-gray-300 px-4 py-2' } }),
    ],
    content: value,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editable: !readOnly,
    editorProps: {
      attributes: { class: 'prose prose-sm max-w-none focus:outline-none' },
    },
  });

  // ── External value sync ─────────────────────────────────────────────────────
  useEffect(() => {
    if (editor && value !== editor.getHTML()) editor.commands.setContent(value);
  }, [editor, value]);

  // ── Click listener: detect image clicks ────────────────────────────────────
  useEffect(() => {
    if (!editor || readOnly) return;

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'IMG') {
        const img = target as HTMLImageElement;
        const container = containerRef.current;
        if (!container) return;

        const containerRect = container.getBoundingClientRect();
        const imgRect        = img.getBoundingClientRect();

        setSelectedImg(img);
        setToolbarPos({
          top:  imgRect.top  - containerRect.top,
          left: imgRect.left - containerRect.left,
        });
      } else {
        setSelectedImg(null);
        setToolbarPos(null);
      }
    };

    const dom = editor.view.dom;
    dom.addEventListener('click', handleClick);
    return () => dom.removeEventListener('click', handleClick);
  }, [editor, readOnly]);

  // ── Map a clicked <img> element back to its position in the document ───────
  //
  // getHTML() serializes from the editor's own document model (state.doc),
  // not from the live DOM - so a plain `img.style.width = ...` never shows
  // up in getHTML() at all. It looks like it worked because the browser
  // still paints the mutated element, but the very next transaction (or a
  // reload of the saved value) redraws the image from the model and the
  // change is gone. Every edit below has to go through a real transaction.
  const findImagePos = useCallback((img: HTMLImageElement): number | null => {
    if (!editor) return null;
    let foundPos: number | null = null;
    editor.state.doc.descendants((node: any, pos: number) => {
      if (foundPos !== null) return false;
      if (node.type.name === 'image' && editor.view.nodeDOM(pos) === img) {
        foundPos = pos;
        return false;
      }
      return true;
    });
    return foundPos;
  }, [editor]);

  /** Commit attribute changes on a specific image node via a real transaction. */
  const commitImageAttrs = useCallback((img: HTMLImageElement, attrs: Record<string, any>) => {
    if (!editor) return false;
    const pos = findImagePos(img);
    if (pos === null) return false;
    editor.chain().focus().setNodeSelection(pos).updateAttributes('image', attrs).run();
    return true;
  }, [editor, findImagePos]);

  // ── Resize selected image (preset buttons) ──────────────────────────────────
  const handleResize = useCallback((pct: number) => {
    if (!selectedImg) return;
    commitImageAttrs(selectedImg, { width: pct === 100 ? '100%' : `${pct}%` });
  }, [selectedImg, commitImageAttrs]);

  // ── Open image edit modal ───────────────────────────────────────────────────
  const handleEditOpen = useCallback(() => {
    if (!selectedImg) return;
    setEditModalSrc(selectedImg.src);
  }, [selectedImg]);

  // ── Delete selected image ───────────────────────────────────────────────────
  const handleDeleteImage = useCallback(() => {
    if (!selectedImg || !editor) return;
    const pos = findImagePos(selectedImg);
    if (pos !== null) {
      editor.chain().focus().setNodeSelection(pos).deleteSelection().run();
    }
    setSelectedImg(null);
    setToolbarPos(null);
  }, [selectedImg, editor, findImagePos]);

  // ── Apply edit result (new src) ─────────────────────────────────────────────
  const handleEditSave = useCallback((newSrc: string) => {
    if (!selectedImg) return;
    commitImageAttrs(selectedImg, { src: newSrc });
    setEditModalSrc(null);
  }, [selectedImg, commitImageAttrs]);

  // ── Click-and-drag resize handle ────────────────────────────────────────────
  const resizeHandleRef = useRef<HTMLDivElement>(null);

  /** Glue the little resize square to the selected image's bottom-right corner. */
  const positionResizeHandle = useCallback((img: HTMLImageElement) => {
    const handle    = resizeHandleRef.current;
    const container = containerRef.current;
    if (!handle || !container || !document.body.contains(img)) return;
    const containerRect = container.getBoundingClientRect();
    const imgRect        = img.getBoundingClientRect();
    handle.style.top  = `${imgRect.bottom - containerRect.top - 6}px`;
    handle.style.left = `${imgRect.right  - containerRect.left - 6}px`;
  }, []);

  useEffect(() => {
    if (selectedImg) positionResizeHandle(selectedImg);
  }, [selectedImg, toolbarPos, positionResizeHandle]);

  // Outline the selected image so it's obvious a click landed and a handle appeared.
  useEffect(() => {
    if (!selectedImg) return;
    selectedImg.style.outline = '2px solid #3b82f6';
    selectedImg.style.outlineOffset = '2px';
    return () => {
      selectedImg.style.outline = '';
      selectedImg.style.outlineOffset = '';
    };
  }, [selectedImg]);

  const handleResizeDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const img = selectedImg;
    if (!img) return;

    const startX        = e.clientX;
    const startWidthPx   = img.getBoundingClientRect().width;
    const parentWidth    = img.parentElement?.clientWidth || startWidthPx;
    const MIN_PX          = 30;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaX     = moveEvent.clientX - startX;
      const newWidthPx = Math.max(MIN_PX, Math.min(parentWidth, startWidthPx + deltaX));
      // Live feedback only - not persisted until mouseup commits it.
      img.style.width = `${newWidthPx}px`;
      positionResizeHandle(img);
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);

      const finalPct = Math.max(5, Math.min(100, (img.getBoundingClientRect().width / parentWidth) * 100));
      // Clear the temporary drag style so the committed `width` attribute -
      // not a leftover inline pixel style - drives the rendered size.
      img.style.width = '';
      commitImageAttrs(img, { width: `${finalPct.toFixed(1)}%` });

      if (document.body.contains(img)) {
        positionResizeHandle(img);
        const container = containerRef.current;
        if (container) {
          const containerRect = container.getBoundingClientRect();
          const imgRect        = img.getBoundingClientRect();
          setToolbarPos({ top: imgRect.top - containerRect.top, left: imgRect.left - containerRect.left });
        }
      } else {
        setSelectedImg(null);
        setToolbarPos(null);
      }
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, [selectedImg, commitImageAttrs, positionResizeHandle]);

  const editorStyle: React.CSSProperties = {
    minHeight: `${minHeight}px`,
    ...(maxHeight ? { maxHeight: `${maxHeight}px`, overflowY: 'auto' } : {}),
  };

  return (
    <>
      <div
        ref={containerRef}
        className={`border border-gray-300 rounded-lg overflow-hidden shadow-sm relative ${className}`}
      >
        {!readOnly && (
          <MenuBar
            editor={editor}
            enableImageUpload={enableImageUpload}
            enableTables={enableTables}
            simplified={simplified}
            onImageUploaded={() => {}}
          />
        )}

        {/* Floating image toolbar */}
        {!readOnly && toolbarPos && selectedImg && (
          <ImageFloatToolbar
            position={toolbarPos}
            onResize={handleResize}
            onEdit={handleEditOpen}
            onDelete={handleDeleteImage}
          />
        )}

        {/* Drag-to-resize handle - bottom-right corner of the selected image */}
        {!readOnly && toolbarPos && selectedImg && (
          <div
            ref={resizeHandleRef}
            onMouseDown={handleResizeDragStart}
            title="Drag to resize"
            style={{
              position: 'absolute',
              width: 12,
              height: 12,
              zIndex: 50,
              background: '#3b82f6',
              border: '2px solid #fff',
              borderRadius: 3,
              boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
              cursor: 'nwse-resize',
            }}
          />
        )}

        <EditorContent
          editor={editor}
          className="px-4 py-3 bg-white focus-within:bg-gray-50"
          style={editorStyle}
        />

        {!readOnly && (
          <div className="bg-gray-50 border-t border-gray-300 px-4 py-2 text-xs text-gray-500 flex items-center gap-2">
            <span>{placeholder}</span>
            {!readOnly && (
              <span className="ml-auto text-gray-400">
                💡 Click any image, then drag its bottom-right handle to resize (or crop / remove background)
              </span>
            )}
          </div>
        )}
      </div>

      {/* Image edit modal (rendered outside the editor container) */}
      {editModalSrc && (
        <ImageEditModal
          src={editModalSrc}
          onSave={handleEditSave}
          onClose={() => setEditModalSrc(null)}
        />
      )}
    </>
  );
};

export default RichTextEditor;
