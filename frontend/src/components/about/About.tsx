import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useSettings } from '@/contexts/SettingsContext';
import { getAbsoluteUrl } from '@/utils/urlUtils';

const About: React.FC = () => {
  const navigate = useNavigate();
  const { settings } = useSettings();

  const values = [
    {
      title: 'Excellence',
      description: 'We strive for the highest standards in everything we do, from academics to character development.',
    },
    {
      title: 'Integrity',
      description: 'We foster honesty, responsibility, and ethical behavior in all aspects of school life.',
    },
    {
      title: 'Innovation',
      description: 'We embrace modern teaching methods and technology to prepare students for the future.',
    },
    {
      title: 'Community',
      description: 'We build strong relationships between students, parents, teachers, and the wider community.',
    },
  ];

  const stats = [
    { value: '25+', label: 'Years of Excellence' },
    { value: '2,500+', label: 'Students' },
    { value: '150+', label: 'Qualified Teachers' },
    { value: '98%', label: 'University Placement' },
  ];

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      {/* Hero */}
      <section className="relative bg-gray-900 py-24">
        <div className="absolute inset-0">
          <img
            src="https://images.unsplash.com/photo-1562774053-701939374585?w=1920&q=80"
            alt=""
            className="w-full h-full object-cover opacity-30"
          />
        </div>
        <div className="relative max-w-6xl mx-auto px-6">
          <div className="max-w-2xl">
            <p className="text-xs font-medium text-blue-400 tracking-widest uppercase mb-3">
              About Us Edward 
            </p>
            <h1 className="text-3xl sm:text-4xl font-semibold text-white mb-4">
              Building Tomorrow's Leaders Today
            </h1>
            <p className="text-base text-gray-300 leading-relaxed">
              {settings?.motto || 'We are dedicated to providing quality education that nurtures academic excellence, character development, and lifelong learning.'}
            </p>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800">
        <div className="max-w-6xl mx-auto px-6 py-12">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map((stat, index) => (
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

      {/* Mission & Vision */}
      <section className="py-16 bg-gray-50 dark:bg-gray-900">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid md:grid-cols-2 gap-12">
            <div>
              <p className="text-xs font-medium text-blue-600 dark:text-blue-400 tracking-widest uppercase mb-2">
                Our Mission
              </p>
              <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
                Empowering Students for Success
              </h2>
              <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
                Our mission is to provide a nurturing and challenging educational environment that empowers students to achieve academic excellence, develop strong character, and become responsible global citizens prepared for the challenges of the 21st century.
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-blue-600 dark:text-blue-400 tracking-widest uppercase mb-2">
                Our Vision
              </p>
              <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
                A World-Class Learning Institution
              </h2>
              <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
                We envision being recognized as a leading educational institution that produces well-rounded graduates who excel in their chosen fields, contribute positively to society, and embody the values of integrity, innovation, and service to others.
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
            {values.map((value, index) => (
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

      {/* History */}
      <section className="py-16 bg-gray-50 dark:bg-gray-900">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <p className="text-xs font-medium text-blue-600 dark:text-blue-400 tracking-widest uppercase mb-2">
                Our History
              </p>
              <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
                A Legacy of Excellence
              </h2>
              <p className="text-gray-600 dark:text-gray-400 leading-relaxed mb-4">
                Founded over two decades ago, our institution has grown from humble beginnings to become one of the most respected educational establishments in the region. Our journey has been marked by continuous improvement, innovation, and an unwavering commitment to student success.
              </p>
              <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
                Today, we continue to build on this legacy, combining traditional values with modern educational practices to prepare our students for an ever-changing world.
              </p>
            </div>
            <div className="relative">
              <img
                src="https://images.unsplash.com/photo-1497633762265-9d179a990aa6?w=800&q=80"
                alt="Library books"
                className="rounded-xl w-full h-64 object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-gray-900 py-12">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
            <div>
              <h2 className="text-xl font-semibold text-white">
                Want to Learn More?
              </h2>
              <p className="mt-1 text-sm text-gray-400">
                Schedule a visit or start your application today.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => navigate('/how-to-apply')}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Apply Now
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => navigate('/')}
                className="px-5 py-2.5 text-sm font-medium text-gray-300 hover:text-white border border-gray-700 hover:border-gray-600 rounded-lg transition-colors"
              >
                Back to Home
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default About;
