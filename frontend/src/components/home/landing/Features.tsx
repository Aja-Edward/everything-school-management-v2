import React from 'react';
import { Link } from 'react-router-dom';
import {
  Users, FileSpreadsheet, MonitorCheck, CalendarCheck, GraduationCap,
  HeartHandshake, Wallet, Globe, ArrowRight,
} from 'lucide-react';

// Grouped by the problem a proprietor is trying to solve, most urgent first.
// Only working modules belong here. "addOn" marks the ones billed on top of
// the Basic package (TenantService.ADD_ON_SERVICES in the backend).
const FEATURES = [
  {
    icon: FileSpreadsheet,
    title: 'Exams and results',
    body: 'Set and schedule exams, enter scores by subject, and produce report cards with grades, positions, remarks and signatures.',
    points: ['Your own grading system and assessment components', 'Import exam papers from Word', 'Question bank to reuse questions'],
  },
  {
    icon: MonitorCheck,
    title: 'Computer-based testing (CBT)',
    addOn: true,
    body: 'Students sit exams on computers, with objective questions marked automatically and teachers marking typed answers.',
    points: ['Live invigilation board', 'Exam station for labs with poor internet', 'Each student’s score sent straight to results'],
  },
  {
    icon: Users,
    title: 'Students and school administration',
    body: 'One record for every student, class, subject, teacher and parent, with separate admins for nursery, primary and secondary sections if you need them.',
    points: ['Bulk upload from a spreadsheet', 'End-of-session promotions', 'Role-based access for every user'],
  },
  {
    icon: CalendarCheck,
    title: 'Attendance',
    body: 'Daily class attendance and lesson attendance, taken by teachers and visible to admins and parents.',
    points: ['See absences across the school', 'Optional Gate Tracker records arrivals by card scan (add-on)', 'With the Gate Tracker, parents get arrival and departure alerts'],
  },
  {
    icon: GraduationCap,
    title: 'Teacher tools',
    body: 'Each teacher gets a dashboard for their classes, subjects, attendance, scores and timetable.',
    points: ['Enter scores for their own subjects', 'Take attendance for their classes', 'See their timetable and lessons'],
  },
  {
    icon: HeartHandshake,
    title: 'Parent access',
    body: 'Parents log in to follow their child’s attendance, results and fees, and get email updates from the school.',
    points: ['One login for all their children', 'Email notifications, free', 'SMS alerts, charged per message (add-on)'],
  },
  {
    icon: Wallet,
    title: 'Fees and online payments',
    body: 'Set fees per class, record payments and see who still owes. Parents can pay online through the school’s own Paystack account.',
    points: ['Payments go straight to the school', 'Receipts for every payment', 'Discounts and outstanding balances'],
  },
  {
    icon: Globe,
    title: 'Your school’s own website and portal',
    body: 'Every school gets its own web address with public pages for admissions, activities and contact, and one login page for staff, students and parents.',
    points: ['yourschool.nuventacloud.com', 'Use your own domain if you have one', 'Your logo, colours and photos'],
  },
];

const Features: React.FC = () => (
  <section id="features" className="bg-gray-50 dark:bg-gray-900 py-16 sm:py-20 scroll-mt-16" aria-labelledby="features-title">
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mb-10">
        <p className="text-xs font-semibold text-blue-600 dark:text-blue-400 tracking-widest uppercase mb-2">Features</p>
        <h2 id="features-title" className="text-2xl sm:text-3xl font-semibold text-gray-900 dark:text-white">
          One platform for the whole school
        </h2>
        <p className="mt-3 text-base text-gray-600 dark:text-gray-400">
          Admins, teachers, students and parents each get the screens they need. Switch on only the modules your school uses.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {FEATURES.map(({ icon: Icon, title, body, points, addOn }) => (
          <article key={title} className="flex flex-col bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-4">
              <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center">
                <Icon className="w-5 h-5 text-blue-600 dark:text-blue-400" aria-hidden="true" />
              </div>
              {addOn && (
                <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                  Add-on
                </span>
              )}
            </div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h3>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{body}</p>
            <ul className="mt-3 space-y-1.5 text-sm text-gray-600 dark:text-gray-400">
              {points.map((p) => (
                <li key={p} className="flex gap-2">
                  <span className="mt-2 w-1 h-1 rounded-full bg-blue-600 shrink-0" aria-hidden="true" />
                  {p}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>

      <div className="mt-10 flex flex-col sm:flex-row gap-3 sm:items-center">
        <Link
          to="/book-demo"
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg"
        >
          See it working in a free demo
          <ArrowRight className="w-4 h-4" aria-hidden="true" />
        </Link>
        <span className="text-sm text-gray-500 dark:text-gray-400">We’ll show you the modules your school cares about.</span>
      </div>
    </div>
  </section>
);

export default Features;
