import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Check } from 'lucide-react';
import api from '@/services/api';

// This page describes how a SCHOOL gets onboarded onto Nuventa Cloud - not
// how a student applies to a school. It only ever renders on the main
// marketing domain (see pages/HowToApplyPage.tsx), and every CTA here goes
// to /onboarding/register, the platform's own school-registration flow.
const HowToApply: React.FC = () => {
  const navigate = useNavigate();
  const [supportEmail, setSupportEmail] = useState('support@nuventacloud.com');

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/api/tenants/platform-content/');
        if (res.contact_email) setSupportEmail(res.contact_email);
      } catch {
        // keep the default above
      }
    })();
  }, []);

  const steps = [
    {
      number: '01',
      title: 'Register Your School',
      description: 'Tell us your school name and create your admin account.',
      items: ['School name', 'Your name & email', 'A password'],
    },
    {
      number: '02',
      title: 'Choose Your Services',
      description: 'Pick the modules your school needs - only pay for what you use.',
      items: ['Core features included', 'Add-ons priced per student', 'Change plans anytime'],
    },
    {
      number: '03',
      title: 'Set Up Your School',
      description: 'Add your classes, teachers, and students, and configure your branding.',
      items: ['Classes & sections', 'Teachers & students', 'Logo & school colours'],
    },
    {
      number: '04',
      title: 'Go Live',
      description: 'Start taking attendance, running exams, and publishing results.',
      items: ['Attendance & lessons', 'Exams & results', 'Fees & communication'],
    },
  ];

  const requirements = [
    {
      title: 'About Your School',
      items: ["Your school's name", 'Roughly how many students', 'Term/session structure (optional - can be set up later)'],
    },
    {
      title: 'Admin Account',
      items: ['Your full name', 'A valid email address', 'A phone number'],
    },
    {
      title: 'Choosing Services',
      items: ['Core features come included', 'Add-ons billed per student', 'No card required to start registration'],
    },
  ];

  const timeline = [
    { label: 'Register Your School', date: '~5 minutes' },
    { label: 'Choose Your Services', date: '~5 minutes' },
    { label: 'Add Your Data', date: 'Same day' },
    { label: 'Go Live', date: 'Whenever you’re ready' },
  ];

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      {/* Hero */}
      <section className="relative bg-gray-900 py-24">
        <div className="absolute inset-0">
          <img
            src="https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=1920&q=80"
            alt=""
            className="w-full h-full object-cover opacity-30"
          />
        </div>
        <div className="relative max-w-6xl mx-auto px-6">
          <div className="max-w-2xl">
            <p className="text-xs font-medium text-blue-400 tracking-widest uppercase mb-3">
              Onboarding
            </p>
            <h1 className="text-3xl sm:text-4xl font-semibold text-white mb-4">
              Getting Your School Onto Nuventa Cloud
            </h1>
            <p className="text-base text-gray-300 leading-relaxed mb-6">
              Registration takes minutes, not weeks. Tell us about your school, choose the services you need, and start managing your school the same day.
            </p>
            <button
              onClick={() => navigate('/onboarding/register')}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Start Registration
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
              How It Works
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
              Before You Register
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
              No Long Wait
            </p>
            <h2 className="text-2xl sm:text-3xl font-semibold text-gray-900 dark:text-white">
              How Long It Takes
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
                  Our team is happy to walk you through registration or answer questions before you start.
                </p>
                <div className="space-y-2 text-sm text-gray-300">
                  <p>{supportEmail}</p>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 md:justify-end">
                <button
                  onClick={() => navigate('/onboarding/register')}
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  Start Registration
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
        </div>
      </section>
    </div>
  );
};

export default HowToApply;
