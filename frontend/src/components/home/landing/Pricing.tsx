import React from 'react';
import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';

// How billing actually works (backend tenants/pricing.py): one Basic price per
// student per term covers every module except the add-ons, which are billed
// on top. A school can pay by the term or for the whole session, and the
// platform admin can agree a school's own prices. No figures are published
// here until the business decides to; schools get a quote.
const BASIC = [
  'Exams, results and report cards',
  'Student, staff and parent records',
  'Attendance and lesson attendance',
  'Fees and online payments',
  'Timetables and question bank',
  'Parent and teacher portals',
  'Email notifications to parents',
  'Your school’s own website and web address',
];

const ADD_ONS = [
  { name: 'Computer-based testing (CBT)', how: 'per student' },
  { name: 'Gate Tracker and arrival alerts', how: 'per student' },
  { name: 'SMS notifications', how: 'per message sent' },
];

const Pricing: React.FC = () => (
  <section id="pricing" className="bg-gray-50 dark:bg-gray-900 py-16 sm:py-20 scroll-mt-16" aria-labelledby="pricing-title">
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mb-10">
        <p className="text-xs font-semibold text-blue-600 dark:text-blue-400 tracking-widest uppercase mb-2">Pricing</p>
        <h2 id="pricing-title" className="text-2xl sm:text-3xl font-semibold text-gray-900 dark:text-white">
          Pay per student, per term
        </h2>
        <p className="mt-3 text-base text-gray-600 dark:text-gray-400">
          No setup bundle to buy. You pay for the students you have, by the term or for the whole session,
          and add extras only if you want them.
        </p>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-xl bg-white dark:bg-gray-800 border-2 border-blue-600 p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Basic package</h3>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">One price per student, per term. Includes:</p>
          <ul className="mt-4 grid sm:grid-cols-2 gap-x-6 gap-y-2">
            {BASIC.map((item) => (
              <li key={item} className="flex gap-2 text-sm text-gray-700 dark:text-gray-300">
                <Check className="w-4 h-4 mt-0.5 text-blue-600 dark:text-blue-400 shrink-0" aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-6 flex flex-col">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Optional add-ons</h3>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">Billed on top of Basic, only if you switch them on.</p>
          <ul className="mt-4 space-y-3">
            {ADD_ONS.map(({ name, how }) => (
              <li key={name} className="text-sm">
                <span className="block font-medium text-gray-900 dark:text-white">{name}</span>
                <span className="text-gray-500 dark:text-gray-400">Charged {how}</span>
              </li>
            ))}
          </ul>
          <div className="mt-auto pt-6">
            <Link
              to="/book-demo"
              className="block text-center px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg"
            >
              Get a quote for your school
            </Link>
          </div>
        </div>
      </div>
    </div>
  </section>
);

export default Pricing;
