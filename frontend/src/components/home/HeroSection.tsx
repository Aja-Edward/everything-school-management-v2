import React, { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '@/services/api';

interface ValueItem {
  title: string;
  description: string;
}

interface StatItem {
  value: string;
  label: string;
}

// Sensible defaults describing the platform itself, shown until a platform
// admin fills in real copy via Platform Users -> Site Content. Mirrors
// components/about/About.tsx's FALLBACK so this page and /about never say
// contradictory things about Nuventa Cloud before real content is entered.
// This component only ever renders on the main marketing domain (see
// pages/Landing.tsx) - a school's own subdomain uses components/tenant/HeroSection
// instead, so nothing here should ever mention a specific school.
const FALLBACK = {
  hero_title: 'Software for the way schools actually run',
  hero_subtitle:
    "Nuventa Cloud gives schools one place to manage admissions, attendance, exams, results, fees, and communication with parents — built for how administrators, teachers, and families actually work day to day.",
  values: [
    { title: 'Reliability', description: 'Report cards, attendance, and fees are not things that can go wrong — our platform is built to be dependable every single day of the term.' },
    { title: 'Simplicity', description: 'Powerful does not have to mean complicated. Every screen is designed for the person who has five minutes between classes, not a training manual.' },
    { title: 'Fair Pricing', description: 'Good software should not be reserved for schools with the biggest budgets. We price for the schools we actually serve.' },
    { title: 'Real Support', description: "When a school needs help, they reach a person who understands schools — not a ticket queue." },
  ] as ValueItem[],
  stats: [] as StatItem[],
};

const HERO_IMAGE = 'https://images.unsplash.com/photo-1509062522246-3755977927d7?w=1920&q=80';

const HeroSection: React.FC = () => {
  const navigate = useNavigate();
  const [content, setContent] = useState(FALLBACK);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/api/tenants/platform-content/');
        setContent({
          hero_title: res.about_hero_title || FALLBACK.hero_title,
          hero_subtitle: res.about_hero_subtitle || FALLBACK.hero_subtitle,
          values: Array.isArray(res.about_values) && res.about_values.length ? res.about_values : FALLBACK.values,
          stats: Array.isArray(res.about_stats) ? res.about_stats : FALLBACK.stats,
        });
      } catch {
        // Platform content couldn't be loaded (e.g. offline) - the fallback
        // above is a complete section on its own.
        setContent(FALLBACK);
      }
    })();
  }, []);

  return (
    <div className="relative">
      {/* Hero */}
      <section className="relative min-h-[90vh] flex items-center overflow-hidden bg-gray-950">
        {/* Background */}
        <div className="absolute inset-0">
          <img src={HERO_IMAGE} alt="" className="w-full h-full object-cover opacity-40" />
          <div className="absolute inset-0 bg-black/60" />
          <div className="absolute inset-0 bg-gradient-to-r from-black/40 via-transparent to-transparent" />
        </div>

        {/* Grid Pattern */}
        <div
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
            backgroundSize: '80px 80px',
          }}
        />

        {/* Content */}
        <div className="relative z-10 w-full max-w-6xl mx-auto px-6 lg:px-8 pt-24 pb-16">
          <div className="max-w-2xl">
            <p className="text-xs font-medium text-white/80 tracking-widest uppercase mb-6">
              Nuventa Cloud
            </p>

            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-semibold text-white leading-tight tracking-tight drop-shadow-lg">
              {content.hero_title}
            </h1>
            <p className="mt-4 text-base text-gray-200 leading-relaxed max-w-xl drop-shadow">
              {content.hero_subtitle}
            </p>

            {/* CTA */}
            <div className="flex flex-wrap gap-3 mt-8">
              <button
                onClick={() => navigate('/onboarding/register')}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors shadow-lg"
              >
                Get Started
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => navigate('/about')}
                className="px-5 py-2.5 text-sm font-medium text-white bg-white/10 hover:bg-white/20 border border-white/20 hover:border-white/30 rounded-lg transition-colors backdrop-blur-sm"
              >
                Learn More
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Stats — only shown once a platform admin has actually filled some in */}
      {content.stats.length > 0 && (
        <section className="bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800">
          <div className="max-w-6xl mx-auto px-6 lg:px-8 py-12">
            <div className={`grid grid-cols-2 gap-8 ${content.stats.length >= 4 ? 'md:grid-cols-4' : `md:grid-cols-${content.stats.length}`}`}>
              {content.stats.map((stat, index) => (
                <div key={index} className="text-center">
                  <div className="text-2xl sm:text-3xl font-semibold text-gray-900 dark:text-white">
                    {stat.value}
                  </div>
                  <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    {stat.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Features */}
      <section className="bg-gray-50 dark:bg-gray-900 py-16">
        <div className="max-w-6xl mx-auto px-6 lg:px-8">
          <div className="text-center mb-12">
            <p className="text-xs font-medium text-blue-600 dark:text-blue-400 tracking-widest uppercase mb-2">
              Why Nuventa Cloud
            </p>
            <h2 className="text-2xl sm:text-3xl font-semibold text-gray-900 dark:text-white">
              Everything Your School Needs, in One Place
            </h2>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {content.values.map((value, index) => (
              <div
                key={index}
                className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-100 dark:border-gray-700"
              >
                <div className="w-2 h-2 rounded-full bg-blue-600 mb-4" />
                <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">
                  {value.title}
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                  {value.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-gray-900 py-12">
        <div className="max-w-6xl mx-auto px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
            <div>
              <h2 className="text-xl font-semibold text-white">
                Ready to see Nuventa Cloud in your school?
              </h2>
              <p className="mt-1 text-sm text-gray-400">
                Registration takes a few minutes.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => navigate('/onboarding/register')}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Register School
              </button>
              <button
                onClick={() => navigate('/contact')}
                className="px-5 py-2.5 text-sm font-medium text-gray-300 hover:text-white border border-gray-700 hover:border-gray-600 rounded-lg transition-colors"
              >
                Contact Us
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default HeroSection;
