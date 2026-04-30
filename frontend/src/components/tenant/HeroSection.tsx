import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { TenantLandingPage } from '@/services/LandingPageService';

interface CarouselImage {
  id: number;
  image: string;
  title?: string;
  description?: string;
}

interface HeroSectionProps {
  landing: TenantLandingPage;
  primaryColor?: string;
  schoolName?: string;
  schoolMotto?: string;
  schoolLogo?: string;
  carouselImages?: CarouselImage[];
  /** Banner event replaces the hero when active */
  activeBannerEvent?: {
    title: string;
    subtitle?: string;
    image?: string;
    cta_text?: string;
    cta_url?: string;
  } | null;
}

const HeroSection: React.FC<HeroSectionProps> = ({
  landing,
  primaryColor = '#1e40af',
  schoolName,
  schoolMotto,
  schoolLogo,
  carouselImages = [],
  activeBannerEvent,
}) => {
  const [current, setCurrent] = useState(0);
  const [fade, setFade] = useState(true);

  const isCarousel = landing.hero_type === 'carousel' && carouselImages.length > 0;
  const slides = isCarousel ? carouselImages : [];

  const advance = useCallback(
    (dir: 1 | -1) => {
      setFade(false);
      setTimeout(() => {
        setCurrent((c) => (c + dir + slides.length) % slides.length);
        setFade(true);
      }, 300);
    },
    [slides.length]
  );

  useEffect(() => {
    if (!isCarousel || slides.length < 2) return;
    const id = setInterval(() => advance(1), 5000);
    return () => clearInterval(id);
  }, [isCarousel, slides.length, advance]);

  /* ── Background image resolution ── */
  let bgUrl: string | undefined;
  if (activeBannerEvent?.image) bgUrl = activeBannerEvent.image;
  else if (isCarousel && slides[current]) bgUrl = slides[current].image;
  else if (landing.hero_image) bgUrl = landing.hero_image;

  const bgStyle: React.CSSProperties = bgUrl
    ? { backgroundImage: `url(${bgUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : { background: `linear-gradient(135deg, ${primaryColor} 0%, ${primaryColor}cc 60%, #1e293b 100%)` };

  /* ── Texts resolution: banner overrides landing config ── */
  const heroTitle = activeBannerEvent?.title ?? landing.hero_title ?? schoolName ?? 'Welcome';
  const heroSubtitle = activeBannerEvent?.subtitle ?? landing.hero_subtitle ?? schoolMotto;
  const ctaText = activeBannerEvent?.cta_text ?? landing.hero_cta_text;
  const ctaUrl = activeBannerEvent?.cta_url ?? landing.hero_cta_url;
  const secondaryCtaText = !activeBannerEvent ? landing.hero_secondary_cta_text : undefined;
  const secondaryCtaUrl = !activeBannerEvent ? landing.hero_secondary_cta_url : undefined;

  return (
    <section className="relative min-h-screen flex items-center overflow-hidden" style={bgStyle}>
      {/* Carousel slides fade — rendered before the overlay so darkening applies on top */}
      {isCarousel && slides.length > 1 && (
        <div
          className="absolute inset-0 transition-opacity duration-700"
          style={{ opacity: fade ? 1 : 0, backgroundImage: `url(${slides[current].image})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
        />
      )}

      {/* Overlay — sits above both the static bg and carousel slides */}
      <div className="absolute inset-0 bg-black/65" />
      {/* Bottom gradient for extra text legibility */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />

      {/* Content */}
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 md:py-32 w-full">
        <div className="max-w-3xl">
          {schoolLogo && (
            <img
              src={schoolLogo}
              alt={schoolName}
              className="h-20 w-20 object-contain rounded-full mb-6 border-2 border-white/30 shadow-lg"
            />
          )}

          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/20 backdrop-blur-sm border border-white/30 mb-5">
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-white/90 text-xs font-medium tracking-wide uppercase">
              Now Enrolling
            </span>
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold text-white leading-tight mb-5 drop-shadow-lg">
            {heroTitle}
          </h1>

          {heroSubtitle && (
            <p className="text-lg sm:text-xl text-white/85 leading-relaxed mb-8 max-w-2xl">
              {heroSubtitle}
            </p>
          )}

          <div className="flex flex-wrap gap-4">
            <Link
              to={ctaUrl}
              className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl font-semibold text-white shadow-xl transition-all duration-200 hover:opacity-90 hover:scale-105 active:scale-95"
              style={{ backgroundColor: primaryColor }}
            >
              {ctaText}
            </Link>
            {secondaryCtaText && secondaryCtaUrl && (
              <Link
                to={secondaryCtaUrl}
                className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl font-semibold text-white bg-white/20 backdrop-blur-sm border border-white/40 hover:bg-white/30 transition-all duration-200 hover:scale-105 active:scale-95"
              >
                {secondaryCtaText}
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Carousel controls */}
      {isCarousel && slides.length > 1 && (
        <>
          <button
            onClick={() => advance(-1)}
            className="absolute left-4 top-1/2 -translate-y-1/2 z-20 p-2 rounded-full bg-white/20 backdrop-blur-sm border border-white/30 text-white hover:bg-white/40 transition"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <button
            onClick={() => advance(1)}
            className="absolute right-4 top-1/2 -translate-y-1/2 z-20 p-2 rounded-full bg-white/20 backdrop-blur-sm border border-white/30 text-white hover:bg-white/40 transition"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 flex gap-2">
            {slides.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrent(i)}
                className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${i === current ? 'bg-white scale-125' : 'bg-white/50'}`}
              />
            ))}
          </div>
        </>
      )}

      {/* Scroll indicator */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 hidden md:flex flex-col items-center gap-1 text-white/60">
        <span className="text-xs tracking-widest uppercase">Scroll</span>
        <div className="w-px h-6 bg-white/40 animate-pulse" />
      </div>
    </section>
  );
};

export default HeroSection;
