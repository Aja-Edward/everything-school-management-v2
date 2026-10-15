import React from 'react';
import { ArrowRight } from 'lucide-react';

// The everyday problems a proprietor recognises, each paired with what the
// platform actually does about it. Every "solution" here is a working module;
// keep it that way when editing.
const PROBLEMS = [
  {
    problem: 'Results take weeks to compile by hand',
    solution: 'Teachers enter scores once. Nuventa Cloud works out totals, grades and positions and produces report cards with remarks and signatures.',
  },
  {
    problem: 'Student records are spread across files and spreadsheets',
    solution: 'Every student, class, subject and guardian in one place. Upload your existing records from a spreadsheet instead of retyping them.',
  },
  {
    problem: 'Attendance registers are hard to keep and harder to check',
    solution: 'Teachers mark attendance on a phone or laptop, and you can see who is absent in every class, as it happens.',
  },
  {
    problem: 'Parents keep calling to ask about results and fees',
    solution: 'Parents log in to see their child’s attendance, results and fees, and can pay fees online into the school’s own Paystack account.',
  },
  {
    problem: 'Setting, printing and marking exams eats up the term',
    solution: 'Build papers from a question bank or import them from Word, print them, or run them as computer-based tests that mark objective questions for you.',
  },
  {
    problem: 'Fee records never quite add up',
    solution: 'Set fees per class, record every payment, and see at a glance who still owes and how much.',
  },
];

const Problems: React.FC = () => (
  <section id="problems" className="bg-white dark:bg-gray-950 py-16 sm:py-20" aria-labelledby="problems-title">
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mb-10">
        <p className="text-xs font-semibold text-blue-600 dark:text-blue-400 tracking-widest uppercase mb-2">Sound familiar?</p>
        <h2 id="problems-title" className="text-2xl sm:text-3xl font-semibold text-gray-900 dark:text-white">
          The admin work that holds schools back, handled
        </h2>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {PROBLEMS.map(({ problem, solution }) => (
          <div key={problem} className="rounded-xl border border-gray-200 dark:border-gray-800 p-5 sm:p-6 bg-gray-50 dark:bg-gray-900">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">{problem}</h3>
            <p className="mt-2 flex gap-2 text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
              <ArrowRight className="w-4 h-4 mt-0.5 text-blue-600 dark:text-blue-400 shrink-0" aria-hidden="true" />
              <span>{solution}</span>
            </p>
          </div>
        ))}
      </div>
    </div>
  </section>
);

export default Problems;
