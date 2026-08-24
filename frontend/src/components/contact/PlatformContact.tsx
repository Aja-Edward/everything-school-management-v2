import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Phone, MapPin, Clock, ArrowRight } from 'lucide-react';
import api from '@/services/api';

const FALLBACK = {
  intro: "Questions about Nuventa Cloud, want a demo, or need help with an existing school account? We'd like to hear from you.",
  email: 'support@nuventacloud.com',
  phone: '',
  address: '',
  office_hours: '',
};

const PlatformContact: React.FC = () => {
  const navigate = useNavigate();
  const [content, setContent] = useState(FALLBACK);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/api/tenants/platform-content/');
        setContent({
          intro: res.contact_intro || FALLBACK.intro,
          email: res.contact_email || FALLBACK.email,
          phone: res.contact_phone || FALLBACK.phone,
          address: res.contact_address || FALLBACK.address,
          office_hours: res.contact_office_hours || FALLBACK.office_hours,
        });
      } catch {
        setContent(FALLBACK);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const cards = [
    content.email && { icon: Mail, label: 'Email', value: content.email, href: `mailto:${content.email}` },
    content.phone && { icon: Phone, label: 'Phone', value: content.phone, href: `tel:${content.phone.replace(/\s+/g, '')}` },
    content.address && { icon: MapPin, label: 'Address', value: content.address, href: undefined },
    content.office_hours && { icon: Clock, label: 'Office Hours', value: content.office_hours, href: undefined },
  ].filter(Boolean) as { icon: typeof Mail; label: string; value: string; href?: string }[];

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      {/* Hero */}
      <section className="bg-gray-900 py-20">
        <div className="max-w-6xl mx-auto px-6">
          <div className="max-w-2xl">
            <p className="text-xs font-medium text-blue-400 tracking-widest uppercase mb-3">
              Get in Touch
            </p>
            <h1 className="text-3xl sm:text-4xl font-semibold text-white mb-4">
              Contact Nuventa Cloud
            </h1>
            {!loading && (
              <p className="text-base text-gray-300 leading-relaxed">{content.intro}</p>
            )}
          </div>
        </div>
      </section>

      {/* Contact details */}
      <section className="py-16 bg-gray-50 dark:bg-gray-900">
        <div className="max-w-6xl mx-auto px-6">
          {loading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-800 p-6 h-28 animate-pulse" />
              ))}
            </div>
          ) : cards.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-gray-500">
                Reach us at{' '}
                <a href={`mailto:${FALLBACK.email}`} className="text-blue-600 hover:underline">{FALLBACK.email}</a>.
              </p>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {cards.map(({ icon: Icon, label, value, href }) => (
                <div key={label} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-800 p-6">
                  <div className="w-9 h-9 bg-blue-50 dark:bg-blue-900/30 rounded-lg flex items-center justify-center mb-3">
                    <Icon className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">{label}</p>
                  {href ? (
                    <a href={href} className="text-sm font-medium text-gray-900 dark:text-white hover:text-blue-600 break-words">
                      {value}
                    </a>
                  ) : (
                    <p className="text-sm font-medium text-gray-900 dark:text-white break-words">{value}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* CTA */}
      <section className="bg-gray-900 py-12">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
            <div>
              <h2 className="text-xl font-semibold text-white">Ready to bring your school onto Nuventa Cloud?</h2>
              <p className="mt-1 text-sm text-gray-400">Registration takes a few minutes.</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => navigate('/onboarding/register')}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Get Started
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => navigate('/about')}
                className="px-5 py-2.5 text-sm font-medium text-gray-300 hover:text-white border border-gray-700 hover:border-gray-600 rounded-lg transition-colors"
              >
                About Us
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default PlatformContact;
