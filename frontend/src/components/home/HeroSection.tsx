import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { usePlatformContent } from '@/hooks/usePlatformContent';

// The main marketing domain's hero. A school's own subdomain uses
// components/tenant/HeroSection instead, so nothing here should ever mention
// a specific school.
//
// The copy lives here rather than in Site Content: every claim on the
// homepage is checked against what the product actually does, and the About
// page keeps its own editable copy. Only the stats strip comes from Site
// Content, and only once a platform admin fills it in.

const HERO_IMAGE = 'https://images.unsplash.com/photo-1509062522246-3755977927d7?w=1600&q=70';

const HIGHLIGHTS = [
  'Results and report cards from the scores teachers enter',
  'Computer-based tests, marked automatically',
  'Attendance, fees and parent access in the same place',
];

const HeroSection: React.FC = () => {
  const { content } = usePlatformContent();
  const stats = content.about_stats.filter((s) => s.value && s.label);

  return (
    <>
      <section className="relative overflow-hidden bg-gray-950" aria-labelledby="hero-title">
        <div className="absolute inset-0">
          <img src={HERO_IMAGE} alt="" className="w-full h-full object-cover opacity-35" fetchPriority="high" />
          <div className="absolute inset-0 bg-gradient-to-r from-gray-950 via-gray-950/85 to-gray-950/40" />
        </div>

        <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-28 pb-16 sm:pt-32 sm:pb-24">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold text-blue-300 tracking-widest uppercase mb-4">
              School management software for Nigerian schools
            </p>
            <h1 id="hero-title" className="text-3xl sm:text-4xl lg:text-5xl font-semibold text-white leading-tight tracking-tight">
              Everything your school needs to run smarter.
            </h1>
            <p className="mt-5 text-base sm:text-lg text-gray-200 leading-relaxed">
              Manage student records, exams, results, attendance and fees from one cloud platform.
              Spend less time on paperwork, and give teachers and parents what they need without the back-and-forth.
            </p>

            <ul className="mt-6 space-y-2">
              {HIGHLIGHTS.map((h) => (
                <li key={h} className="flex items-start gap-2 text-sm text-gray-200">
                  <CheckCircle2 className="w-4 h-4 mt-0.5 text-blue-300 shrink-0" aria-hidden="true" />
                  {h}
                </li>
              ))}
            </ul>

            <div className="flex flex-col sm:flex-row gap-3 mt-8">
              <Link
                to="/book-demo"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-lg transition-colors shadow-lg"
              >
                Book a free demo
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </Link>
              <a
                href="#features"
                className="inline-flex items-center justify-center px-6 py-3 text-sm font-semibold text-white bg-white/10 hover:bg-white/20 border border-white/25 rounded-lg transition-colors"
              >
                Explore features
              </a>
            </div>
            <p className="mt-4 text-sm text-gray-300">
              Ready to start?{' '}
              <Link to="/onboarding/register" className="font-medium text-white underline underline-offset-2 hover:text-blue-200">
                Register your school
              </Link>{' '}
              in a few minutes.
            </p>
          </div>
        </div>
      </section>

      {/* Stats — only shown once a platform admin has filled some in under Site Content */}
      {stats.length > 0 && (
        <section className="bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800" aria-label="Nuventa Cloud in numbers">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
            <dl className={`grid grid-cols-2 gap-6 ${stats.length >= 4 ? 'md:grid-cols-4' : stats.length === 3 ? 'md:grid-cols-3' : ''}`}>
              {stats.map((stat, index) => (
                <div key={index} className="text-center">
                  <dt className="sr-only">{stat.label}</dt>
                  <dd className="text-2xl sm:text-3xl font-semibold text-gray-900 dark:text-white">{stat.value}</dd>
                  <dd className="mt-1 text-sm text-gray-500 dark:text-gray-400">{stat.label}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
      )}
    </>
  );
};

export default HeroSection;
