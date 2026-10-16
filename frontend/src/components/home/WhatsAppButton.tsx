import React from 'react';
import { MessageCircle } from 'lucide-react';
import { usePlatformContent, whatsappLink } from '@/hooks/usePlatformContent';
import { trackPixelEvent } from '@/utils/metaPixel';

/**
 * Floating "Chat on WhatsApp" button for the marketing pages. Shows nothing
 * until a platform admin sets the WhatsApp number under Site Content.
 */
const WhatsAppButton: React.FC = () => {
  const { content } = usePlatformContent();
  const href = whatsappLink(content.contact_whatsapp, "Hello, I'd like to know more about Nuventa Cloud for my school.");
  if (!href) return null;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => trackPixelEvent('Contact', { content_name: 'WhatsApp button' })}
      className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 pl-3 pr-4 py-3 rounded-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium shadow-lg focus:outline-none focus:ring-4 focus:ring-blue-300"
    >
      <MessageCircle className="w-5 h-5" aria-hidden="true" />
      <span>Chat on WhatsApp</span>
    </a>
  );
};

export default WhatsAppButton;
