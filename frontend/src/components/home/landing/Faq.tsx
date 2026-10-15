import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import { usePlatformContent } from '@/hooks/usePlatformContent';

// Only questions the product itself answers. Training, data backups and
// support hours are business commitments not yet written down anywhere, so
// they are left out until they are.
const Faq: React.FC = () => {
  const { email } = usePlatformContent();

  const items: { q: string; a: React.ReactNode }[] = [
    {
      q: 'What is Nuventa Cloud?',
      a: 'Cloud software that runs a school’s day-to-day administration: student records, exams, results and report cards, attendance, fees, and portals for teachers, students and parents.',
    },
    {
      q: 'Which schools can use it?',
      a: 'Private nursery, primary, junior secondary and senior secondary schools, including schools that run several of these sections with a separate admin for each.',
    },
    {
      q: 'How does registration work?',
      a: (
        <>
          Fill in the <Link to="/onboarding/register" className="text-blue-600 dark:text-blue-400 hover:underline">registration form</Link> with
          your school’s name and your details. Your school gets its own web address straight away, and you choose
          which modules to switch on.
        </>
      ),
    },
    {
      q: 'How do teachers, students and parents get on?',
      a: 'An admin adds them one at a time or uploads them all from a spreadsheet. Each person then logs in at your school’s web address and sees only what their role allows.',
    },
    {
      q: 'Can parents see their child’s information?',
      a: 'Yes. Parents see their child’s attendance, results and fees, can pay fees online, and receive email notifications from the school. A parent with several children sees them all under one login.',
    },
    {
      q: 'What internet access do we need?',
      a: 'Nuventa Cloud runs in a web browser on a phone, tablet or computer, so day-to-day use needs an internet connection. For computer-based tests in a lab with unreliable internet, an exam station on the school’s own network lets students sit papers with no internet.',
    },
    {
      q: 'How are subscriptions billed?',
      a: 'Per student, per term, or for the whole session. Your invoice is in your admin dashboard and can be paid online. Add-ons such as CBT and SMS are billed separately, only if you use them.',
    },
    {
      q: 'How are our school’s records kept private?',
      a: 'Each school’s records are kept separate from every other school’s, and every user’s access depends on their role: a parent sees only their own children, a teacher only their classes.',
    },
    {
      q: 'How do we get a demo or help?',
      a: (
        <>
          <Link to="/book-demo" className="text-blue-600 dark:text-blue-400 hover:underline">Book a free demo</Link>, or
          email <a href={`mailto:${email}`} className="text-blue-600 dark:text-blue-400 hover:underline">{email}</a>.
        </>
      ),
    },
  ];

  return (
    <section id="faq" className="bg-white dark:bg-gray-950 py-16 sm:py-20 scroll-mt-16" aria-labelledby="faq-title">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 id="faq-title" className="text-2xl sm:text-3xl font-semibold text-gray-900 dark:text-white mb-8">
          Frequently asked questions
        </h2>
        <div className="divide-y divide-gray-200 dark:divide-gray-800 border-y border-gray-200 dark:border-gray-800">
          {items.map(({ q, a }) => (
            <details key={q} className="group py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-medium text-gray-900 dark:text-white [&::-webkit-details-marker]:hidden">
                {q}
                <ChevronDown className="w-5 h-5 shrink-0 text-gray-400 transition-transform group-open:rotate-180" aria-hidden="true" />
              </summary>
              <div className="mt-3 text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{a}</div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Faq;
