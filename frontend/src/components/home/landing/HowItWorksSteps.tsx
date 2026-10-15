import React from 'react';
import { Link } from 'react-router-dom';

// The real onboarding path: /onboarding/register -> /onboarding/services ->
// the school's own admin dashboard. The full version is /how-to-apply.
const STEPS = [
  {
    title: 'Register or book a demo',
    body: 'Register your school online in a few minutes, or book a demo first and we’ll show you around.',
  },
  {
    title: 'Choose your modules',
    body: 'Exams and results are always included. Switch on attendance, fees, CBT and the rest as you need them.',
  },
  {
    title: 'Add your school’s records',
    body: 'Set up classes and subjects, then upload students, teachers and parents from a spreadsheet.',
  },
  {
    title: 'Start using it',
    body: 'Everyone logs in at your school’s own web address and sees only what their role allows.',
  },
];

const HowItWorksSteps: React.FC = () => (
  <section id="how-it-works" className="bg-white dark:bg-gray-950 py-16 sm:py-20 scroll-mt-16" aria-labelledby="how-title">
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mb-10">
        <p className="text-xs font-semibold text-blue-600 dark:text-blue-400 tracking-widest uppercase mb-2">How it works</p>
        <h2 id="how-title" className="text-2xl sm:text-3xl font-semibold text-gray-900 dark:text-white">
          From sign-up to your first report cards
        </h2>
      </div>

      <ol className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {STEPS.map(({ title, body }, i) => (
          <li key={title} className="relative">
            <div className="w-9 h-9 rounded-full bg-blue-600 text-white text-sm font-semibold flex items-center justify-center mb-4">
              {i + 1}
            </div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h3>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{body}</p>
          </li>
        ))}
      </ol>

      <p className="mt-8 text-sm text-gray-600 dark:text-gray-400">
        Want the details?{' '}
        <Link to="/how-to-apply" className="font-medium text-blue-600 dark:text-blue-400 hover:underline">
          Read the full setup guide
        </Link>
      </p>
    </div>
  </section>
);

export default HowItWorksSteps;
