import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

const SchoolActivities: React.FC = () => {
  const navigate = useNavigate();

  const activities = [
    {
      title: 'Sports & Athletics',
      description: 'Football, basketball, track and field, swimming, and more competitive sports programs.',
      image: 'https://images.unsplash.com/photo-1461896836934- voices-5bb01fec?w=800&q=80',
    },
    {
      title: 'Arts & Music',
      description: 'Drama club, choir, band, visual arts, and creative expression programs.',
      image: 'https://images.unsplash.com/photo-1514320291840-2e0a9bf2a9ae?w=800&q=80',
    },
    {
      title: 'Science & Technology',
      description: 'Robotics club, coding classes, science fair, and STEM competitions.',
      image: 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=800&q=80',
    },
    {
      title: 'Community Service',
      description: 'Volunteer programs, charity events, and social responsibility initiatives.',
      image: 'https://images.unsplash.com/photo-1559027615-cd4628902d4a?w=800&q=80',
    },
    {
      title: 'Debate & Public Speaking',
      description: 'Debate team, Model UN, public speaking workshops, and competitions.',
      image: 'https://images.unsplash.com/photo-1524178232363-1fb2b075b655?w=800&q=80',
    },
    {
      title: 'Cultural Activities',
      description: 'Cultural festivals, language clubs, and heritage celebration events.',
      image: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=800&q=80',
    },
  ];

  const clubs = [
    'Chess Club',
    'Book Club',
    'Photography Club',
    'Environmental Club',
    'Math Olympiad',
    'Creative Writing',
    'Film Society',
    'Entrepreneurship Club',
  ];

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      {/* Hero */}
      <section className="relative bg-gray-900 py-24">
        <div className="absolute inset-0">
          <img
            src="https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=1920&q=80"
            alt=""
            className="w-full h-full object-cover opacity-30"
          />
        </div>
        <div className="relative max-w-6xl mx-auto px-6">
          <div className="max-w-2xl">
            <p className="text-xs font-medium text-blue-400 tracking-widest uppercase mb-3">
              Student Life
            </p>
            <h1 className="text-3xl sm:text-4xl font-semibold text-white mb-4">
              School Activities
            </h1>
            <p className="text-base text-gray-300 leading-relaxed">
              Discover the wide range of extracurricular activities that help our students develop skills, discover passions, and build lasting friendships.
            </p>
          </div>
        </div>
      </section>

      {/* Activities Grid */}
      <section className="py-16 bg-white dark:bg-gray-950">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-12">
            <p className="text-xs font-medium text-blue-600 dark:text-blue-400 tracking-widest uppercase mb-2">
              Extracurricular Programs
            </p>
            <h2 className="text-2xl sm:text-3xl font-semibold text-gray-900 dark:text-white">
              Programs & Activities
            </h2>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {activities.map((activity, index) => (
              <div
                key={index}
                className="group bg-gray-50 dark:bg-gray-900 rounded-xl overflow-hidden border border-gray-100 dark:border-gray-800"
              >
                <div className="h-40 overflow-hidden">
                  <img
                    src={activity.image}
                    alt={activity.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                </div>
                <div className="p-6">
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">
                    {activity.title}
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                    {activity.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Clubs */}
      <section className="py-16 bg-gray-50 dark:bg-gray-900">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <p className="text-xs font-medium text-blue-600 dark:text-blue-400 tracking-widest uppercase mb-2">
                Student Organizations
              </p>
              <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
                Clubs & Societies
              </h2>
              <p className="text-gray-600 dark:text-gray-400 leading-relaxed mb-6">
                Our student-led clubs provide opportunities for students to explore their interests, develop leadership skills, and connect with peers who share similar passions.
              </p>
              <div className="flex flex-wrap gap-2">
                {clubs.map((club, index) => (
                  <span
                    key={index}
                    className="px-3 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg border border-gray-200 dark:border-gray-700"
                  >
                    {club}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <img
                src="https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=800&q=80"
                alt="Students collaborating"
                className="rounded-xl w-full h-64 object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Events */}
      <section className="py-16 bg-white dark:bg-gray-950">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-12">
            <p className="text-xs font-medium text-blue-600 dark:text-blue-400 tracking-widest uppercase mb-2">
              School Calendar
            </p>
            <h2 className="text-2xl sm:text-3xl font-semibold text-gray-900 dark:text-white">
              Annual Events
            </h2>
          </div>

          <div className="grid md:grid-cols-4 gap-6">
            {[
              { name: 'Sports Day', month: 'March' },
              { name: 'Science Fair', month: 'May' },
              { name: 'Cultural Week', month: 'September' },
              { name: 'Graduation', month: 'July' },
            ].map((event, index) => (
              <div
                key={index}
                className="text-center p-6 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800"
              >
                <div className="text-sm font-medium text-blue-600 dark:text-blue-400 mb-1">
                  {event.month}
                </div>
                <div className="text-base font-semibold text-gray-900 dark:text-white">
                  {event.name}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-gray-900 py-12">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
            <div>
              <h2 className="text-xl font-semibold text-white">
                Ready to Join Us?
              </h2>
              <p className="mt-1 text-sm text-gray-400">
                Become part of our vibrant school community.
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
                onClick={() => navigate('/about')}
                className="px-5 py-2.5 text-sm font-medium text-gray-300 hover:text-white border border-gray-700 hover:border-gray-600 rounded-lg transition-colors"
              >
                Learn More
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default SchoolActivities;
