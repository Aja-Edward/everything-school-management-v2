import React from 'react';
import { Mail, MessageCircle, Phone, CheckCircle2 } from 'lucide-react';
import DemoRequestForm from '@/components/home/DemoRequestForm';
import { usePlatformContent, whatsappLink } from '@/hooks/usePlatformContent';
import { trackPixelEvent } from '@/utils/metaPixel';

/**
 * /book-demo: the page every "Book a free demo" button and ad points at.
 * Keep it focused: what the demo is, the form, and other ways to reach us.
 */
const WHAT_YOU_GET = [
  'A walk through the modules your school cares about',
  'Answers on setup, pricing and moving your records across',
  'No obligation to subscribe',
];

const BookDemoPage: React.FC = () => {
  const { content, email } = usePlatformContent();
  const wa = whatsappLink(content.contact_whatsapp, "Hello, I'd like a demo of Nuventa Cloud for my school.");

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <section className="bg-gray-900 pt-28 pb-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold text-blue-300 tracking-widest uppercase mb-3">Free demo</p>
            <h1 className="text-3xl sm:text-4xl font-semibold text-white">See Nuventa Cloud working for your school</h1>
            <p className="mt-3 text-base text-gray-300">
              Tell us a little about your school and we’ll get in touch to arrange a time to show you around.
            </p>
          </div>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 -mt-12 pb-16">
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 relative bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 sm:p-8 shadow-sm">
            <DemoRequestForm source="book-demo" />
          </div>

          <aside className="space-y-6">
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-3">In your demo</h2>
              <ul className="space-y-2">
                {WHAT_YOU_GET.map((item) => (
                  <li key={item} className="flex gap-2 text-sm text-gray-600 dark:text-gray-400">
                    <CheckCircle2 className="w-4 h-4 mt-0.5 text-blue-600 dark:text-blue-400 shrink-0" aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-3">Prefer to talk now?</h2>
              <ul className="space-y-3 text-sm">
                {wa && (
                  <li>
                    <a href={wa} target="_blank" rel="noopener noreferrer"
                      onClick={() => trackPixelEvent('Contact', { content_name: 'WhatsApp on demo page' })}
                      className="inline-flex items-center gap-2 font-medium text-green-700 dark:text-green-400 hover:underline">
                      <MessageCircle className="w-4 h-4" aria-hidden="true" /> Chat on WhatsApp
                    </a>
                  </li>
                )}
                {content.contact_phone && (
                  <li>
                    <a href={`tel:${content.contact_phone.replace(/\s+/g, '')}`}
                      className="inline-flex items-center gap-2 text-gray-700 dark:text-gray-300 hover:text-blue-600">
                      <Phone className="w-4 h-4" aria-hidden="true" /> {content.contact_phone}
                    </a>
                  </li>
                )}
                <li>
                  <a href={`mailto:${email}`} className="inline-flex items-center gap-2 text-gray-700 dark:text-gray-300 hover:text-blue-600 break-all">
                    <Mail className="w-4 h-4 shrink-0" aria-hidden="true" /> {email}
                  </a>
                </li>
              </ul>
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
};

export default BookDemoPage;
