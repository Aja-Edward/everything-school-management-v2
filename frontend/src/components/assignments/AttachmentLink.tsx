import React, { useState } from 'react';
import { Download, Loader2, Paperclip } from 'lucide-react';

// Cloudinary stores the file under a random id, so a plain link would save
// it under that id. Fetching it lets us save it under the uploader's filename;
// if the fetch is blocked we fall back to opening the file.
const downloadAttachment = async (url: string, filename: string) => {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blobUrl = URL.createObjectURL(await response.blob());
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
};

interface AttachmentLinkProps {
  url: string;
  name: string;
  fallbackName?: string;
  className?: string;
}

/** A file's name, which opens it, and a button that saves it under that name. */
const AttachmentLink: React.FC<AttachmentLinkProps> = ({ url, name, fallbackName = 'Attachment', className = '' }) => {
  const [downloading, setDownloading] = useState(false);

  const download = async () => {
    setDownloading(true);
    await downloadAttachment(url, name || fallbackName);
    setDownloading(false);
  };

  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-2 ${className}`}>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-sm text-blue-600 dark:text-blue-400 hover:underline break-all"
      >
        <Paperclip className="w-4 h-4 shrink-0" />
        {name || fallbackName}
      </a>
      <button
        type="button"
        onClick={download}
        disabled={downloading}
        className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60"
      >
        {downloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
        {downloading ? 'Downloading…' : 'Download'}
      </button>
    </div>
  );
};

export default AttachmentLink;
