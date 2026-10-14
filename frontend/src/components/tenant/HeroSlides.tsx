import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './heroSlides.css';

/**
 * The school hero's background: a stack of image layers that change with a
 * different, randomly chosen transition each time.
 *
 * It replaces a single background whose URL was swapped the moment a slide
 * changed, before the new image had downloaded, which showed white for a
 * beat. Here an image is only shown once it has loaded and decoded, the
 * outgoing slide stays underneath until the new one covers it, and the
 * school's colour sits under everything instead of the page's white.
 */

const EFFECTS = [
  'fade', 'zoom', 'blur', 'slide-left', 'slide-right', 'slide-up', 'slide-down',
  'circle', 'wipe', 'curtain', 'tilt',
] as const;
type Effect = (typeof EFFECTS)[number];
const HAS_EXIT = new Set<Effect>(['slide-left', 'slide-right', 'slide-up', 'slide-down', 'zoom']);

const TRANSITION_MS = 1400;

/** A slow zoom-and-pan for one slide, never quite the same twice. */
interface Drift { from: string; to: string; origin: string }

const rand = (min: number, max: number) => min + Math.random() * (max - min);

function randomDrift(): Drift {
  const zoomIn = Math.random() < 0.6;
  const [small, large] = [rand(1.04, 1.08), rand(1.14, 1.22)];
  const dx = rand(-3, 3).toFixed(2);
  const dy = rand(-2, 2).toFixed(2);
  const start = `scale(${(zoomIn ? small : large).toFixed(3)})`;
  const end = `scale(${(zoomIn ? large : small).toFixed(3)}) translate(${dx}%, ${dy}%)`;
  return { from: start, to: end, origin: `${rand(20, 80).toFixed(0)}% ${rand(25, 75).toFixed(0)}%` };
}

function pickEffect(previous: Effect | null): Effect {
  const choices = EFFECTS.filter((e) => e !== previous);
  return choices[Math.floor(Math.random() * choices.length)];
}

/** Resolves once the image can be painted at once, or after a time limit. */
function whenReady(url: string, cache: Map<string, Promise<void>>): Promise<void> {
  let ready = cache.get(url);
  if (!ready) {
    ready = new Promise<void>((resolve) => {
      const img = new Image();
      const done = () => resolve();
      img.onload = () => (img.decode ? img.decode().then(done, done) : done());
      img.onerror = done; // a broken image must not stop the carousel
      img.src = url;
    });
    cache.set(url, ready);
  }
  return Promise.race([ready, new Promise<void>((r) => setTimeout(r, 8000))]);
}

interface Layer {
  key: number;
  index: number;
  effect: Effect;
  drift: Drift;
  leaving: boolean;
  x: string;
  y: string;
}

export interface HeroSlidesHandle {
  go: (target: number) => void;
}

interface HeroSlidesProps {
  images: string[];
  /** How long each slide stays before the next, transition included. */
  intervalMs?: number;
  /** Called when the visible slide changes, for the dots under the hero. */
  onChange?: (index: number) => void;
  /** The school's colour, shown under the images instead of white. */
  baseColor?: string;
}

const HeroSlides = React.forwardRef<HeroSlidesHandle, HeroSlidesProps>(
  ({ images: imagesProp, intervalMs = 6500, onChange, baseColor = '#1e40af' }, ref) => {
    // The page builds a new array each render; restart only when the URLs do.
    const imagesKey = imagesProp.join('\n');
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const images = useMemo(() => imagesProp, [imagesKey]);
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;
    const [layers, setLayers] = useState<Layer[]>([]);
    const cache = useRef(new Map<string, Promise<void>>());
    const current = useRef(-1);
    const lastEffect = useRef<Effect | null>(null);
    const busy = useRef(false);
    const nextKey = useRef(0);
    const timer = useRef<number | undefined>(undefined);

    const show = useCallback(
      async (target: number) => {
        if (busy.current || !images.length || target === current.current) return;
        busy.current = true;
        await whenReady(images[target], cache.current);

        // The very first slide simply fades up from the school's colour.
        const effect = current.current === -1 ? 'fade' : pickEffect(lastEffect.current);
        lastEffect.current = effect;
        const layer: Layer = {
          key: nextKey.current++, index: target, effect, drift: randomDrift(), leaving: false,
          x: `${rand(15, 85).toFixed(0)}%`, y: `${rand(20, 80).toFixed(0)}%`,
        };
        current.current = target;
        onChangeRef.current?.(target);
        setLayers((prev) => [...prev.map((l) => ({ ...l, leaving: true })), layer]);

        // Drop the outgoing slide only once the new one has fully covered it.
        window.setTimeout(() => {
          setLayers((prev) => prev.filter((l) => l.key === layer.key));
          busy.current = false;
        }, TRANSITION_MS + 50);

        // Warm the slide after this one while this one is on screen.
        if (images.length > 1) whenReady(images[(target + 1) % images.length], cache.current);
      },
      [images],
    );

    React.useImperativeHandle(ref, () => ({ go: (target: number) => show(target) }), [show]);

    // Start with the first image, and again whenever the list changes.
    useEffect(() => {
      current.current = -1;
      lastEffect.current = null;
      busy.current = false;
      setLayers([]);
      if (images.length) show(0);
    }, [images, show]);

    // Advance on a timer, but not while the tab is hidden: there is nobody to
    // watch it, and the browser would only bunch the changes up on return.
    useEffect(() => {
      if (images.length < 2) return;
      const tick = () => {
        if (!document.hidden) show((current.current + 1) % images.length);
      };
      timer.current = window.setInterval(tick, intervalMs);
      return () => window.clearInterval(timer.current);
    }, [images, intervalMs, show]);

    return (
      <div
        className="absolute inset-0"
        style={{ background: `linear-gradient(135deg, ${baseColor} 0%, ${baseColor}cc 55%, #0f172a 100%)` }}
        aria-hidden="true"
      >
        {layers.map((layer) => {
          const style = {
            '--hs-ms': `${TRANSITION_MS}ms`,
            '--hs-drift-ms': `${intervalMs + TRANSITION_MS * 2}ms`,
            '--hs-from': layer.drift.from,
            '--hs-to': layer.drift.to,
            '--hs-origin': layer.drift.origin,
            '--hs-x': layer.x,
            '--hs-y': layer.y,
            zIndex: layer.leaving ? 1 : 2,
          } as React.CSSProperties;
          const motion = layer.leaving
            ? HAS_EXIT.has(layers[layers.length - 1]?.effect) ? `hs-exit hs-out-${layers[layers.length - 1].effect}` : ''
            : `hs-enter hs-in-${layer.effect}`;
          return (
            <div key={layer.key} className={`hs-layer ${motion}`} style={style}>
              <img src={images[layer.index]} alt="" decoding="async" draggable={false} />
            </div>
          );
        })}
      </div>
    );
  },
);

HeroSlides.displayName = 'HeroSlides';
export default HeroSlides;
