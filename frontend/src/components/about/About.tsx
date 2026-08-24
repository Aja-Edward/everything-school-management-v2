import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import api from '@/services/api';

// Sensible defaults describing the platform itself, used until a platform
// admin edits real copy in via the Platform Users -> Site Content panel.
// Never mention a specific school here - this page renders on the main
// domain, not any tenant's own subdomain.
const FALLBACK = {
  hero_title: 'Software for the way schools actually run',
  hero_subtitle:
    "Nuventa Cloud gives schools one place to manage admissions, attendance, exams, results, fees, and communication with parents — built for how administrators, teachers, and families actually work day to day.",
  mission_title: 'Our Mission',
  mission_body:
    'To give every school — not just the ones that can afford a custom system — software that makes running the school easier, not harder. We build for administrators juggling a dozen responsibilities, teachers who need things to just work, and parents who want a clear view of how their child is doing.',
  vision_title: 'Our Vision',
  vision_body:
    "A future where no school runs its operations on paper registers and scattered spreadsheets by default — where every school, regardless of size or budget, has access to the same quality of tools as the best-resourced institutions.",
  story_title: 'Why We Built This',
  story_body:
    "Nuventa Cloud started from a simple observation: most school management software is either too expensive for the schools that need it most, or too complicated for the staff who have to use it every day. We set out to build something different — a platform that a school can be up and running on in days, not months, priced for the realities of the schools we serve.",
  values: [
    { title: 'Reliability', description: 'Report cards, attendance, and fees are not things that can go wrong — our platform is built to be dependable every single day of the term.' },
    { title: 'Simplicity', description: 'Powerful does not have to mean complicated. Every screen is designed for the person who has five minutes between classes, not a training manual.' },
    { title: 'Fair Pricing', description: 'Good software should not be reserved for schools with the biggest budgets. We price for the schools we actually serve.' },
    { title: 'Real Support', description: "When a school needs help, they reach a person who understands schools — not a ticket queue." },
  ],
  stats: [] as { value: string; label: string }[],
};

const About: React.FC = () => {
  const navigate = useNavigate();
  const [content, setContent] = useState<typeof FALLBACK | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/api/tenants/platform-content/');
        setContent({
          hero_title: res.about_hero_title || FALLBACK.hero_title,
          hero_subtitle: res.about_hero_subtitle || FALLBACK.hero_subtitle,
          mission_title: res.about_mission_title || FALLBACK.mission_title,
          mission_body: res.about_mission_body || FALLBACK.mission_body,
          vision_title: res.about_vision_title || FALLBACK.vision_title,
          vision_body: res.about_vision_body || FALLBACK.vision_body,
          story_title: res.about_story_title || FALLBACK.story_title,
          story_body: res.about_story_body || FALLBACK.story_body,
          values: Array.isArray(res.about_values) && res.about_values.length ? res.about_values : FALLBACK.values,
          stats: Array.isArray(res.about_stats) ? res.about_stats : FALLBACK.stats,
        });
      } catch {
        // Platform content couldn't be loaded (e.g. offline) - the fallback
        // copy below is a complete page on its own, so just use it.
        setContent(FALLBACK);
      }
    })();
  }, []);

  const c = content || FALLBACK;

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      {/* Hero */}
      <section className="relative bg-gray-900 py-24">
        <div className="absolute inset-0">
          <img
            src="https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=1920&q=80"
            alt=""
            className="w-full h-full object-cover opacity-30"
          />
        </div>
        <div className="relative max-w-6xl mx-auto px-6">
          <div className="max-w-2xl">
            <p className="text-xs font-medium text-blue-400 tracking-widest uppercase mb-3">
              About Nuventa Cloud
            </p>
            <h1 className="text-3xl sm:text-4xl font-semibold text-white mb-4">
              {c.hero_title}
            </h1>
            <p className="text-base text-gray-300 leading-relaxed">
              {c.hero_subtitle}
            </p>
          </div>
        </div>
      </section>

      {/* Stats — only shown once a platform admin has actually filled some in */}
      {c.stats.length > 0 && (
        <section className="bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800">
          <div className="max-w-6xl mx-auto px-6 py-12">
            <div className={`grid grid-cols-2 gap-8 ${c.stats.length >= 4 ? 'md:grid-cols-4' : `md:grid-cols-${c.stats.length}`}`}>
              {c.stats.map((stat, index) => (
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

      {/* Mission & Vision */}
      <section className="py-16 bg-gray-50 dark:bg-gray-900">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid md:grid-cols-2 gap-12">
            <div>
              <p className="text-xs font-medium text-blue-600 dark:text-blue-400 tracking-widest uppercase mb-2">
                Our Mission
              </p>
              <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
                {c.mission_title}
              </h2>
              <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
                {c.mission_body}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-blue-600 dark:text-blue-400 tracking-widest uppercase mb-2">
                Our Vision
              </p>
              <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
                {c.vision_title}
              </h2>
              <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
                {c.vision_body}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="py-16 bg-white dark:bg-gray-950">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-12">
            <p className="text-xs font-medium text-blue-600 dark:text-blue-400 tracking-widest uppercase mb-2">
              Our Values
            </p>
            <h2 className="text-2xl sm:text-3xl font-semibold text-gray-900 dark:text-white">
              What We Stand For
            </h2>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {c.values.map((value, index) => (
              <div
                key={index}
                className="bg-gray-50 dark:bg-gray-900 rounded-xl p-6 border border-gray-100 dark:border-gray-800"
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

      {/* Story */}
      <section className="py-16 bg-gray-50 dark:bg-gray-900">
        <div className="max-w-6xl mx-auto px-6">
          <div className="max-w-3xl">
            <p className="text-xs font-medium text-blue-600 dark:text-blue-400 tracking-widest uppercase mb-2">
              Our Story
            </p>
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
              {c.story_title}
            </h2>
            <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
              {c.story_body}
            </p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-gray-900 py-12">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
            <div>
              <h2 className="text-xl font-semibold text-white">
                See Nuventa Cloud in Your School
              </h2>
              <p className="mt-1 text-sm text-gray-400">
                Get in touch, or start setting up your school today.
              </p>
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

export default About;
