/**
 * ImageEditModal
 *
 * Provides crop and background removal for images in the exam editor.
 *
 * Root fix vs original:
 *   - Tainted canvas: browser blocks canvas.toBlob() for cross-origin images.
 *     We now fetch the image as a Blob first, create a local objectURL,
 *     and draw from that so the canvas is never tainted.
 *   - Background removal: pass the fetched Blob directly to removeBackground()
 *     instead of the external URL, which also avoids CORS fetch failures.
 */
import React, { useState, useRef, useCallback, useEffect } from 'react';
import ReactCrop, { type PercentCrop, centerCrop, makeAspectCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { X, Crop as CropIcon, Wand2, RotateCcw, Check, Loader2, AlertCircle } from 'lucide-react';
import { uploadImageToCloudinary } from './ImageUploader';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ImageEditModalProps {
  src: string;
  onSave: (newSrc: string) => void;
  onClose: () => void;
}

type Mode = 'view' | 'crop' | 'bg_removal';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Fetch an image as a Blob so the canvas will not be tainted.
 * Throws a user-friendly error if the server blocks cross-origin access.
 */
async function fetchImageAsBlob(url: string): Promise<Blob> {
  let res: Response;
  try {
    res = await fetch(url, { mode: 'cors' });
  } catch {
    throw new Error(
      'This image is from an external website that blocks cross-origin access. ' +
      'To edit it, please download the image and re-upload it using the "📤 Upload" button.'
    );
  }
  if (!res.ok) {
    throw new Error(
      `Could not retrieve image (${res.status}). ` +
      'If this is an external URL, download and re-upload it using the "📤 Upload" button.'
    );
  }
  return res.blob();
}

/**
 * Load an image from a Blob (or objectURL) and return a fully loaded
 * HTMLImageElement whose canvas will never be tainted.
 */
function loadImageFromBlob(blob: Blob): Promise<{ img: HTMLImageElement; objectUrl: string }> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(blob);
    const img = new Image();
    img.onload  = () => resolve({ img, objectUrl });
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('Image failed to load')); };
    img.src = objectUrl;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Canvas is empty'))), 'image/png')
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

const ImageEditModal: React.FC<ImageEditModalProps> = ({ src, onSave, onClose }) => {
  const [mode,    setMode]    = useState<Mode>('view');
  const [crop,    setCrop]    = useState<PercentCrop>();
  const [status,  setStatus]  = useState('');
  const [error,   setError]   = useState('');
  const [working, setWorking] = useState(false);

  /** The current "working copy" URL. Starts as original src, updated after each edit. */
  const [preview, setPreview] = useState(src);

  /** The ref to the <img> inside ReactCrop — used to read display dimensions for crop maths */
  const cropImgRef = useRef<HTMLImageElement>(null);

  // Reset on open
  useEffect(() => {
    setPreview(src);
    setMode('view');
    setStatus('');
    setError('');
    setWorking(false);
  }, [src]);

  // ── Initialise crop selection when image loads ──────────────────────────────
  const onCropImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget;
    setCrop(
      centerCrop(
        makeAspectCrop({ unit: '%', width: 80 }, width / height, width, height),
        width,
        height
      )
    );
  };

  // ── Apply crop ──────────────────────────────────────────────────────────────
  const handleApplyCrop = useCallback(async () => {
    if (!cropImgRef.current || !crop?.width || !crop?.height) return;

    setWorking(true);
    setError('');
    setStatus('Fetching image…');

    try {
      // Step 1 — fetch image as blob so canvas won't be tainted
      const blob = await fetchImageAsBlob(preview);

      setStatus('Cropping…');
      const { img: freshImg, objectUrl } = await loadImageFromBlob(blob);

      // Step 2 — crop is in % (PercentCrop), convert directly to natural pixel dims
      const nw = freshImg.naturalWidth;
      const nh = freshImg.naturalHeight;
      const px = Math.round((crop.x      / 100) * nw);
      const py = Math.round((crop.y      / 100) * nh);
      const pw = Math.max(1, Math.round((crop.width  / 100) * nw));
      const ph = Math.max(1, Math.round((crop.height / 100) * nh));

      // Step 3 — draw cropped region to canvas (not tainted)
      const canvas  = document.createElement('canvas');
      canvas.width  = pw;
      canvas.height = ph;
      const ctx     = canvas.getContext('2d')!;
      ctx.drawImage(freshImg, px, py, pw, ph, 0, 0, pw, ph);
      URL.revokeObjectURL(objectUrl);

      // Step 4 — export & upload
      const croppedBlob = await canvasToBlob(canvas);
      setStatus('Uploading…');
      const uploaded = await uploadImageToCloudinary(
        new File([croppedBlob], 'cropped.png', { type: 'image/png' })
      );

      setPreview(uploaded.url);
      setMode('view');
      setStatus('Crop applied ✓');
    } catch (e: any) {
      setError(e.message ?? 'Crop failed. Please try again.');
    } finally {
      setWorking(false);
    }
  }, [crop, preview]);

  // ── Remove background ───────────────────────────────────────────────────────
  const handleRemoveBackground = useCallback(async () => {
    setMode('bg_removal');
    setWorking(true);
    setError('');
    setStatus('Fetching image…');

    try {
      // Fetch image as blob to avoid CORS issues inside the WASM model
      const imageBlob = await fetchImageAsBlob(preview);

      setStatus('Loading AI model (first run ~10 s, then cached)…');
      const { removeBackground } = await import('@imgly/background-removal');

      setStatus('Removing background…');
      // Pass blob directly — no external URL needed by the AI model
      const resultBlob = await removeBackground(imageBlob);

      setStatus('Uploading result…');
      const uploaded = await uploadImageToCloudinary(
        new File([resultBlob], 'no-bg.png', { type: 'image/png' })
      );

      setPreview(uploaded.url);
      setStatus('Background removed ✓');
    } catch (e: any) {
      setError(e.message ?? 'Background removal failed. Please try again.');
    } finally {
      setWorking(false);
      setMode('view');
    }
  }, [preview]);

  // ── Reset ───────────────────────────────────────────────────────────────────
  const handleReset = () => {
    setPreview(src);
    setMode('view');
    setStatus('');
    setError('');
  };

  // ── Save ────────────────────────────────────────────────────────────────────
  const handleSave = () => {
    onSave(preview);
    onClose();
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 flex-shrink-0">
          <div>
            <h3 className="text-base font-bold text-gray-900 dark:text-white">Edit Image</h3>
            <p className="text-xs text-gray-400 mt-0.5">Crop or remove background — changes are uploaded automatically</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 px-5 py-3 border-b border-gray-100 bg-gray-50 flex-shrink-0">
          {/* Crop toggle */}
          <button
            onClick={() => { setMode(m => m === 'crop' ? 'view' : 'crop'); setError(''); }}
            disabled={working}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors disabled:opacity-40 ${
              mode === 'crop'
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-blue-50 hover:border-blue-400'
            }`}
          >
            <CropIcon size={14} />
            {mode === 'crop' ? 'Cancel Crop' : 'Crop'}
          </button>

          {/* Apply crop */}
          {mode === 'crop' && (
            <button
              onClick={handleApplyCrop}
              disabled={working || !crop?.width}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-40 transition-colors"
            >
              {working
                ? <Loader2 size={14} className="animate-spin" />
                : <Check size={14} />}
              Apply Crop
            </button>
          )}

          {/* Remove background */}
          {mode !== 'crop' && (
            <button
              onClick={handleRemoveBackground}
              disabled={working}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 text-sm font-medium hover:bg-purple-50 hover:border-purple-400 hover:text-purple-700 disabled:opacity-40 transition-colors"
            >
              {working && mode === 'bg_removal'
                ? <Loader2 size={14} className="animate-spin text-purple-600" />
                : <Wand2 size={14} />}
              Remove Background
            </button>
          )}

          {/* Reset */}
          {preview !== src && (
            <button
              onClick={handleReset}
              disabled={working}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 bg-white text-gray-600 text-sm font-medium hover:bg-gray-50 disabled:opacity-40 transition-colors"
            >
              <RotateCcw size={14} />
              Reset to Original
            </button>
          )}

          {/* Status / error */}
          <div className="ml-auto">
            {error && (
              <span className="flex items-center gap-1 text-xs text-red-600">
                <AlertCircle size={12} /> {error}
              </span>
            )}
            {!error && status && (
              <span className="text-xs text-gray-500">{status}</span>
            )}
          </div>
        </div>

        {/* Image area */}
        <div className="flex-1 overflow-auto p-6 flex items-center justify-center bg-[#f0f0f0] dark:bg-gray-800">
          {mode === 'crop' ? (
            <ReactCrop
              crop={crop}
              onChange={(_px, pct) => setCrop(pct)}
              style={{ maxWidth: '100%' }}
            >
              <img
                ref={cropImgRef}
                src={preview}
                alt="Crop"
                onLoad={onCropImageLoad}
                crossOrigin="anonymous"
                style={{ maxWidth: '100%', maxHeight: '55vh', objectFit: 'contain', display: 'block' }}
              />
            </ReactCrop>
          ) : (
            <div className="relative inline-flex items-center justify-center">
              <img
                src={preview}
                alt="Preview"
                style={{ maxWidth: '100%', maxHeight: '55vh', objectFit: 'contain', borderRadius: 8 }}
              />
              {working && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/80 rounded-lg gap-3">
                  <Loader2 size={32} className="animate-spin text-purple-600" />
                  <p className="text-sm font-medium text-gray-700 text-center px-4">{status}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-gray-200 bg-white flex-shrink-0">
          <p className="text-xs text-gray-400 max-w-xs">
            Background removal runs entirely in your browser. No image data is sent to any third-party server.
          </p>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-xl text-sm hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={working}
              className="px-5 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              Insert into Question
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ImageEditModal;
