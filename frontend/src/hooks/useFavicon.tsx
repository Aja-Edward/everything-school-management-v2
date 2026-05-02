import { useEffect } from 'react';

interface UseFaviconProps {
  faviconUrl?: string;
  fallbackUrl?: string;
}

export const useFavicon = ({ faviconUrl, fallbackUrl }: UseFaviconProps) => {
  const effectiveUrl = faviconUrl || fallbackUrl;

  useEffect(() => {
    if (!effectiveUrl) return;

    const existingLinks = document.querySelectorAll('link[rel*="icon"]');
    existingLinks.forEach(link => link.remove());

    const urlWithCacheBust = faviconUrl ? `${effectiveUrl}?t=${Date.now()}` : effectiveUrl;

    const link = document.createElement('link');
    link.rel = 'icon';
    link.type = 'image/png';
    link.href = urlWithCacheBust;
    document.head.appendChild(link);

    const linkApple = document.createElement('link');
    linkApple.rel = 'apple-touch-icon';
    linkApple.href = urlWithCacheBust;
    document.head.appendChild(linkApple);
  }, [effectiveUrl]);
};
