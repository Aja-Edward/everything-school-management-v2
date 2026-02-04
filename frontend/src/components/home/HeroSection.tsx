import React, { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useSettings } from '@/contexts/SettingsContext';
import { getAbsoluteUrl } from '@/utils/urlUtils';

interface Slide {
  id: number;
  image: string | null;
  title: string;
  subtitle: string;
  description: string;
}

const HeroSection: React.FC = () => {
  const navigate = useNavigate();
  const { settings } = useSettings();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);

  const slides: Slide[] = [
    {
      id: 1,
      image: 'https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=1920&q=80',
      title: 'Excellence in Education',
      subtitle: 'Nurturing Future Leaders',
      description: 'Providing quality education that prepares students for success in an ever-changing world.',
    },
    {
      id: 2,
      image: 'https://images.unsplash.com/photo-1521587760476-6c12a4b040da?w=1920&q=80',
      title: 'Modern Learning',
      subtitle: 'Technology-Driven Education',
      description: 'State-of-the-art facilities and innovative teaching methods for optimal learning outcomes.',
    },
    {
      id: 3,
      image: 'https://images.unsplash.com/photo-1523050854058-8df90110c9f1?w=1920&q=80',
      title: 'Holistic Development',
      subtitle: 'Beyond Academics',
      description: 'Developing well-rounded individuals through academics, sports, arts, and character building.',
    },
  ];

  const nextSlide = useCallback(() => {
    setCurrentSlide((prev) => (prev + 1) % slides.length);
  }, [slides.length]);

  const prevSlide = useCallback(() => {
    setCurrentSlide((prev) => (prev - 1 + slides.length) % slides.length);
  }, [slides.length]);

  useEffect(() => {
    if (!isAutoPlaying) return;
    const interval = setInterval(nextSlide, 6000);
    return () => clearInterval(interval);
  }, [isAutoPlaying, nextSlide]);

  const handleMouseEnter = () => setIsAutoPlaying(false);
  const handleMouseLeave = () => setIsAutoPlaying(true);

  const stats = [
    { value: '2,500+', label: 'Students Enrolled' },
    { value: '150+', label: 'Expert Teachers' },
    { value: '98%', label: 'Success Rate' },
    { value: '25+', label: 'Years of Excellence' },
  ];

  return (
    <div className="relative">
      {/* Hero Section */}
      <section
        className="relative min-h-[90vh] flex items-center overflow-hidden bg-gray-950"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {/* Background */}
        <div className="absolute inset-0">
          {slides.map((slide, index) => (
            <div
              key={slide.id}
              className={`absolute inset-0 transition-opacity duration-1000 ${
                index === currentSlide ? 'opacity-100' : 'opacity-0'
              }`}
            >
              {slide.image ? (
                <img src={slide.image} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900" />
              )}
              {/* Dark overlay for text readability */}
              <div className="absolute inset-0 bg-black/60" />
              {/* Extra gradient for left side where text appears */}
              <div className="absolute inset-0 bg-gradient-to-r from-black/40 via-transparent to-transparent" />
            </div>
          ))}
        </div>

        {/* Grid Pattern */}
        <div
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
            backgroundSize: '80px 80px',
          }}
        />

        {/* Content */}
        <div className="relative z-10 w-full max-w-6xl mx-auto px-6 lg:px-8 pt-24 pb-16">
          <div className="max-w-2xl">
            {/* School Name */}
            <div className="flex items-center gap-3 mb-8">
              {settings?.logo && (
                <img
                  src={getAbsoluteUrl(settings.logo)}
                  alt=""
                  className="w-8 h-8 rounded object-contain bg-white/10 p-1"
                />
              )}
              <span className="text-xs font-medium text-white/80 tracking-widest uppercase">
                {settings?.tenant_name || 'Welcome'}
              </span>
            </div>

            {/* Slides Content */}
            <div className="relative min-h-[200px]">
              {slides.map((slide, index) => (
                <div
                  key={slide.id}
                  className={`transition-all duration-500 ${
                    index === currentSlide
                      ? 'opacity-100 translate-y-0'
                      : 'opacity-0 translate-y-2 absolute top-0 left-0'
                  }`}
                >
                  {index === currentSlide && (
                    <>
                      <h1 className="text-3xl sm:text-4xl lg:text-5xl font-semibold text-white leading-tight tracking-tight drop-shadow-lg">
                        {slide.title}
                      </h1>
                      <p className="mt-3 text-base sm:text-lg text-blue-300 font-medium drop-shadow">
                        {slide.subtitle}
                      </p>
                      <p className="mt-4 text-base text-gray-200 leading-relaxed max-w-xl drop-shadow">
                        {slide.description}
                      </p>
                    </>
                  )}
                </div>
              ))}
            </div>

            {/* CTA */}
            <div className="flex flex-wrap gap-3 mt-8">
              <button
                onClick={() => navigate('/how-to-apply')}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors shadow-lg"
              >
                Apply for Admission
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => navigate('/about')}
                className="px-5 py-2.5 text-sm font-medium text-white bg-white/10 hover:bg-white/20 border border-white/20 hover:border-white/30 rounded-lg transition-colors backdrop-blur-sm"
              >
                Learn More
              </button>
            </div>

            {/* Slide Controls */}
            <div className="flex items-center gap-3 mt-12">
              <button
                onClick={prevSlide}
                className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 flex items-center justify-center text-white/70 hover:text-white transition-colors backdrop-blur-sm"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <div className="flex gap-1.5">
                {slides.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => setCurrentSlide(index)}
                    className={`h-1.5 rounded-full transition-all ${
                      index === currentSlide ? 'w-6 bg-blue-400' : 'w-1.5 bg-white/30 hover:bg-white/50'
                    }`}
                  />
                ))}
              </div>

              <button
                onClick={nextSlide}
                className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 flex items-center justify-center text-white/70 hover:text-white transition-colors backdrop-blur-sm"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800">
        <div className="max-w-6xl mx-auto px-6 lg:px-8 py-12">
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

      {/* Features */}
      <section className="bg-gray-50 dark:bg-gray-900 py-16">
        <div className="max-w-6xl mx-auto px-6 lg:px-8">
          <div className="text-center mb-12">
            <p className="text-xs font-medium text-blue-600 dark:text-blue-400 tracking-widest uppercase mb-2">
              Why Choose Us
            </p>
            <h2 className="text-2xl sm:text-3xl font-semibold text-gray-900 dark:text-white">
              A Complete Learning Experience
            </h2>
            <p className="mt-3 text-base text-gray-600 dark:text-gray-400 max-w-xl mx-auto">
              We provide comprehensive education that develops academic excellence, character, and life skills.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                title: 'Academic Excellence',
                description: 'Rigorous curriculum designed to challenge and inspire students to reach their full potential.',
              },
              {
                title: 'Expert Faculty',
                description: 'Dedicated teachers with years of experience committed to student success and growth.',
              },
              {
                title: 'Modern Facilities',
                description: 'State-of-the-art classrooms, laboratories, and sports facilities for holistic development.',
              },
            ].map((feature, index) => (
              <div
                key={index}
                className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-100 dark:border-gray-700"
              >
                <div className="w-2 h-2 rounded-full bg-blue-600 mb-4" />
                <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">
                  {feature.title}
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-gray-900 py-12">
        <div className="max-w-6xl mx-auto px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
            <div>
              <h2 className="text-xl font-semibold text-white">
                Ready to Join Our Community?
              </h2>
              <p className="mt-1 text-sm text-gray-400">
                Take the first step towards a bright future.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => navigate('/how-to-apply')}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Apply Now
              </button>
              <button
                onClick={() => navigate('/onboarding/register')}
                className="px-5 py-2.5 text-sm font-medium text-gray-300 hover:text-white border border-gray-700 hover:border-gray-600 rounded-lg transition-colors"
              >
                Register School
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default HeroSection;
