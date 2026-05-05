import React, { useRef, useState, useEffect } from 'react';

// Inject shimmer keyframe once into <head> — no build-tool changes needed
let _shimmerInjected = false;
function injectShimmerCSS() {
  if (_shimmerInjected || typeof document === 'undefined') return;
  const style = document.createElement('style');
  style.dataset.id = 'lazy-image-shimmer';
  style.textContent = `
    @keyframes lazy-shimmer {
      0%   { background-position: -200% center; }
      100% { background-position:  200% center; }
    }
    .lazy-shimmer {
      background: linear-gradient(
        90deg,
        #e2e8f0 0%,
        #f8fafc 40%,
        #e2e8f0 80%
      );
      background-size: 200% 100%;
      animation: lazy-shimmer 1.6s ease-in-out infinite;
    }
  `;
  document.head.appendChild(style);
  _shimmerInjected = true;
}

export interface LazyImageProps {
  src: string;
  alt: string;
  /** Classes on the wrapper div — include height, border-radius, shadow, overflow */
  containerClassName?: string;
  /** Classes on the <img> — typically "w-full h-full object-cover" */
  className?: string;
  style?: React.CSSProperties;
  /**
   * How far below the viewport to start loading.
   * Negative = load before the element is fully visible (preload ahead of scroll).
   * Default: "-80px" — starts loading 80 px before entering viewport.
   */
  rootMargin?: string;
}

const LazyImage: React.FC<LazyImageProps> = ({
  src,
  alt,
  containerClassName = '',
  className = '',
  style,
  rootMargin = '0px 0px -80px 0px',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);   // start loading the img
  const [entered, setEntered] = useState(false); // container slide-up triggered
  const [loaded, setLoaded] = useState(false);   // img.onLoad fired

  useEffect(() => {
    injectShimmerCSS();

    const el = containerRef.current;
    if (!el) return;

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          // Tiny delay so the container's initial opacity:0 state is painted
          // before we flip to opacity:1, making the transition visible.
          requestAnimationFrame(() => {
            requestAnimationFrame(() => setEntered(true));
          });
          io.disconnect();
        }
      },
      { threshold: 0.05, rootMargin }
    );

    io.observe(el);
    return () => io.disconnect();
  }, [rootMargin]);

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden ${containerClassName}`}
      style={{
        // Stage 1: container slides up + fades in when it enters viewport
        opacity: entered ? 1 : 0,
        transform: entered ? 'translateY(0px)' : 'translateY(36px)',
        transition: 'opacity 0.55s cubic-bezier(0.22, 1, 0.36, 1), transform 0.65s cubic-bezier(0.22, 1, 0.36, 1)',
      }}
    >
      {/* Moving shimmer — hidden once image loads */}
      <div
        className="lazy-shimmer absolute inset-0 z-10"
        style={{
          opacity: loaded ? 0 : 1,
          transition: 'opacity 0.5s ease',
          pointerEvents: 'none',
        }}
      />

      {/* Actual image — rendered only once in view, reveals after onLoad */}
      {inView && (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          className={className}
          onLoad={() => setLoaded(true)}
          style={{
            display: 'block',
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            // Stage 2: image zooms in softly as it loads
            opacity: loaded ? 1 : 0,
            transform: loaded ? 'scale(1)' : 'scale(1.06)',
            transition: loaded
              ? 'opacity 0.6s 0.08s cubic-bezier(0.22, 1, 0.36, 1), transform 0.75s 0.08s cubic-bezier(0.22, 1, 0.36, 1)'
              : 'none',
            ...style,
          }}
        />
      )}
    </div>
  );
};

export default LazyImage;
