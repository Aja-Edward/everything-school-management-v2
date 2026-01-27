import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Check } from 'lucide-react';
import { useSettings } from '@/contexts/SettingsContext';

const HowToApply: React.FC = () => {
  const navigate = useNavigate();
  const { settings } = useSettings();

  const steps = [
    {
      number: '01',
      title: 'Complete Application',
      description: 'Fill out our online application form with student and parent information.',
      items: ['Personal details', 'Academic history', 'Parent contacts'],
    },
    {
      number: '02',
      title: 'Submit Documents',
      description: 'Upload required documents including transcripts and identification.',
      items: ['Birth certificate', 'Previous transcripts', 'Passport photos'],
    },
    {
      number: '03',
      title: 'Assessment',
      description: 'Schedule and complete the academic assessment and interview.',
      items: ['Written assessment', 'Student interview', 'Parent meeting'],
    },
    {
      number: '04',
      title: 'Admission Decision',
      description: 'Receive your admission decision within 5-7 business days.',
      items: ['Review process', 'Placement decision', 'Welcome package'],
    },
  ];

  const requirements = [
    {
      title: 'Academic Documents',
      items: ['Previous school transcripts', 'Recommendation letter', 'Test scores (if available)'],
    },
    {
      title: 'Personal Documents',
      items: ['Birth certificate', 'Passport photographs', 'Parent/Guardian ID'],
    },
    {
      title: 'Additional Information',
      items: ['Medical records', 'Emergency contacts', 'Special needs documentation'],
    },
  ];

  const timeline = [
    { label: 'Applications Open', date: 'September 1st' },
    { label: 'Early Decision', date: 'November 15th' },
    { label: 'Regular Deadline', date: 'January 31st' },
    { label: 'School Year Starts', date: 'August 15th' },
  ];

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      {/* Hero */}
      <section className="relative bg-gray-900 py-24">
        <div className="absolute inset-0">
          <img
            src="https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=1920&q=80"
            alt=""
            className="w-full h-full object-cover opacity-30"
          />
        </div>
        <div className="relative max-w-6xl mx-auto px-6">
          <div className="max-w-2xl">
            <p className="text-xs font-medium text-blue-400 tracking-widest uppercase mb-3">
              Admissions
            </p>
            <h1 className="text-3xl sm:text-4xl font-semibold text-white mb-4">
              How to Apply
            </h1>
            <p className="text-base text-gray-300 leading-relaxed mb-6">
              Join our community of learners. Our simple application process makes it easy to get started on your educational journey.
            </p>
            <button
              onClick={() => navigate('/onboarding/register')}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Start Application
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </section>

      {/* Steps */}
      <section className="py-16 bg-white dark:bg-gray-950">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-12">
            <p className="text-xs font-medium text-blue-600 dark:text-blue-400 tracking-widest uppercase mb-2">
              Application Process
            </p>
            <h2 className="text-2xl sm:text-3xl font-semibold text-gray-900 dark:text-white">
              Four Simple Steps
            </h2>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {steps.map((step, index) => (
              <div
                key={index}
                className="bg-gray-50 dark:bg-gray-900 rounded-xl p-6 border border-gray-100 dark:border-gray-800"
              >
                <span className="text-3xl font-bold text-blue-600/20 dark:text-blue-400/20">
                  {step.number}
                </span>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white mt-2 mb-2">
                  {step.title}
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  {step.description}
                </p>
                <ul className="space-y-2">
                  {step.items.map((item, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                      <Check className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Requirements */}
      <section className="py-16 bg-gray-50 dark:bg-gray-900">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-12">
            <p className="text-xs font-medium text-blue-600 dark:text-blue-400 tracking-widest uppercase mb-2">
              What You'll Need
            </p>
            <h2 className="text-2xl sm:text-3xl font-semibold text-gray-900 dark:text-white">
              Application Requirements
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {requirements.map((category, index) => (
              <div
                key={index}
                className="bg-white dark:bg-gray-950 rounded-xl p-6 border border-gray-100 dark:border-gray-800"
              >
                <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">
                  {category.title}
                </h3>
                <ul className="space-y-3">
                  {category.items.map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400">
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-600 mt-1.5 flex-shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Timeline */}
      <section className="py-16 bg-white dark:bg-gray-950">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-12">
            <p className="text-xs font-medium text-blue-600 dark:text-blue-400 tracking-widest uppercase mb-2">
              Important Dates
            </p>
            <h2 className="text-2xl sm:text-3xl font-semibold text-gray-900 dark:text-white">
              Application Timeline
            </h2>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {timeline.map((item, index) => (
              <div key={index} className="text-center">
                <div className="text-lg font-semibold text-gray-900 dark:text-white">
                  {item.date}
                </div>
                <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  {item.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Contact */}
      <section className="py-16 bg-gray-50 dark:bg-gray-900">
        <div className="max-w-6xl mx-auto px-6">
          <div className="bg-gray-900 dark:bg-gray-800 rounded-2xl p-8 md:p-12">
            <div className="grid md:grid-cols-2 gap-8 items-center">
              <div>
                <h2 className="text-2xl font-semibold text-white mb-3">
                  Need Help?
                </h2>
                <p className="text-gray-400 mb-6">
                  Our admissions team is here to guide you through every step of the application process.
                </p>
                <div className="space-y-2 text-sm text-gray-300">
                  <p>{settings?.email || 'admissions@school.com'}</p>
                  <p>{settings?.phone || '+1 (555) 123-4567'}</p>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 md:justify-end">
                <button
                  onClick={() => navigate('/onboarding/register')}
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  Apply Now
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  onClick={() => navigate('/about')}
                  className="px-5 py-2.5 text-sm font-medium text-gray-300 hover:text-white border border-gray-700 hover:border-gray-600 rounded-lg transition-colors"
                >
                  Learn More
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default HowToApply;
