/**
 * Image Uploader for Exam Editor
 *
 * Handles file uploads to Cloudinary for exam images.
 */

import React, { useRef, useState } from 'react';
import { Upload, Loader2, AlertCircle } from 'lucide-react';

// Cloudinary configuration
const CLOUDINARY_CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || 'djbz7wunu';
const CLOUDINARY_UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || 'exam_images';

export interface ImageUploadResult {
  url: string;
  publicId: string;
  width: number;
  height: number;
}

export interface ImageUploaderProps {
  onUpload: (url: string) => void;
  onError?: (error: string) => void;
  accept?: string;
  maxSizeMB?: number;
  className?: string;
  buttonText?: string;
  showPreview?: boolean;
}

/**
 * Upload an image file to Cloudinary
 */
export const uploadImageToCloudinary = async (file: File): Promise<ImageUploadResult> => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
    {
      method: 'POST',
      body: formData,
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || 'Failed to upload image');
  }

  const data = await response.json();

  return {
    url: data.secure_url,
    publicId: data.public_id,
    width: data.width,
    height: data.height,
  };
};

/**
 * ImageUploader Component
 *
 * A button/dropzone for uploading images to Cloudinary.
 */
export const ImageUploader: React.FC<ImageUploaderProps> = ({
  onUpload,
  onError,
  accept = 'image/*',
  maxSizeMB = 5,
  className = '',
  buttonText = 'Upload Image',
  showPreview = false,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file size
    const maxBytes = maxSizeMB * 1024 * 1024;
    if (file.size > maxBytes) {
      const errorMsg = `File size must be less than ${maxSizeMB}MB`;
      setError(errorMsg);
      onError?.(errorMsg);
      return;
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      const errorMsg = 'Please select an image file';
      setError(errorMsg);
      onError?.(errorMsg);
      return;
    }

    setError(null);
    setUploading(true);

    try {
      // Show local preview while uploading
      if (showPreview) {
        const reader = new FileReader();
        reader.onload = (e) => setPreviewUrl(e.target?.result as string);
        reader.readAsDataURL(file);
      }

      const result = await uploadImageToCloudinary(file);
      onUpload(result.url);

      if (showPreview) {
        setPreviewUrl(result.url);
      }
    } catch (err: any) {
      const errorMsg = err.message || 'Failed to upload image';
      setError(errorMsg);
      onError?.(errorMsg);
      setPreviewUrl(null);
    } finally {
      setUploading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className={className}>
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        onChange={handleFileSelect}
        className="hidden"
      />

      <button
        type="button"
        onClick={handleClick}
        disabled={uploading}
        className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium bg-white text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {uploading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Uploading...</span>
          </>
        ) : (
          <>
            <Upload className="w-4 h-4" />
            <span>{buttonText}</span>
          </>
        )}
      </button>

      {error && (
        <div className="mt-2 flex items-center gap-1 text-sm text-red-600">
          <AlertCircle className="w-4 h-4" />
          <span>{error}</span>
        </div>
      )}

      {showPreview && previewUrl && (
        <div className="mt-2">
          <img
            src={previewUrl}
            alt="Preview"
            className="max-w-[200px] max-h-[150px] object-contain rounded border border-gray-200"
          />
        </div>
      )}
    </div>
  );
};

export default ImageUploader;
