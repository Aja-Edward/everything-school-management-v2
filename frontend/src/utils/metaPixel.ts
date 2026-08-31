/**
 * Meta (Facebook) Pixel — platform marketing site only.
 *
 * Nuventa is a single SPA build served from three kinds of host:
 *   1. the platform marketing site      (nuventacloud.com)
 *   2. tenant subdomains                (bayschool.nuventacloud.com)
 *   3. tenant custom domains            (bayschool.com)
 *
 * Dropping the raw Meta snippet into index.html would fire the pixel on all
 * three — meaning we would ship pageview data about schoolchildren, parents and
 * staff using their own school's portal to Meta. That is a privacy problem and
 * it also poisons the ad dataset with existing-user traffic that has nothing to
 * do with acquisition.
 *
 * So the pixel is loaded from here instead, behind a strict hostname allowlist.
 * Anything not on the allowlist — tenant subdomains, custom domains, localhost,
 * preview deploys — never loads the script at all.
 *
 * Fired by <MetaPixel /> (see components/MetaPixel.tsx), which also handles
 * PageView on client-side route changes; the base snippet only fires once on
 * hard load, which in an SPA means Meta would otherwise only ever see the
 * landing page.
 */

const DEFAULT_PIXEL_ID = '1644900083720955';

/** Hosts allowed to load the pixel. Tenant hosts are deliberately absent. */
const DEFAULT_ALLOWED_HOSTS = ['nuventacloud.com', 'www.nuventacloud.com'];

/**
 * Set VITE_META_PIXEL_ID='' to disable tracking entirely (e.g. for a build
 * served into a jurisdiction where you have not yet solved consent).
 */
const PIXEL_ID = (import.meta.env.VITE_META_PIXEL_ID ?? DEFAULT_PIXEL_ID).trim();

/** Comma-separated override, e.g. "nuventacloud.com,staging.nuventacloud.com". */
const ALLOWED_HOSTS: string[] = (import.meta.env.VITE_META_PIXEL_HOSTS
  ? String(import.meta.env.VITE_META_PIXEL_HOSTS).split(',')
  : DEFAULT_ALLOWED_HOSTS
)
  .map((h) => h.trim().toLowerCase())
  .filter(Boolean);

/** Meta standard events. Custom events go through trackPixelCustomEvent. */
export type MetaStandardEvent =
  | 'PageView'
  | 'Lead'
  | 'CompleteRegistration'
  | 'Contact'
  | 'ViewContent'
  | 'Search'
  | 'StartTrial'
  | 'Subscribe'
  | 'InitiateCheckout'
  | 'Purchase';

type FbqParams = Record<string, unknown>;

interface Fbq {
  (...args: unknown[]): void;
  callMethod?: (...args: unknown[]) => void;
  queue?: unknown[][];
  push?: unknown;
  loaded?: boolean;
  version?: string;
}

declare global {
  interface Window {
    fbq?: Fbq;
    _fbq?: Fbq;
  }
}

let initialized = false;

/**
 * True only on the platform marketing host, with a pixel ID configured.
 * Checked before the script tag is ever created, so tenant visitors make no
 * request to Meta at all.
 */
export function isMetaPixelAllowed(): boolean {
  if (typeof window === 'undefined') return false;
  if (!PIXEL_ID) return false;
  return ALLOWED_HOSTS.includes(window.location.hostname.toLowerCase());
}

/** Meta's official base snippet, transcribed. Idempotent. */
function injectPixelScript(): void {
  if (window.fbq) return;

  const fbq: Fbq = function (...args: unknown[]) {
    if (fbq.callMethod) {
      fbq.callMethod.apply(fbq, args);
    } else {
      fbq.queue?.push(args);
    }
  };

  window.fbq = fbq;
  if (!window._fbq) window._fbq = fbq;
  fbq.push = fbq;
  fbq.loaded = true;
  fbq.version = '2.0';
  fbq.queue = [];

  const script = document.createElement('script');
  script.async = true;
  script.src = 'https://connect.facebook.net/en_US/fbevents.js';

  const firstScript = document.getElementsByTagName('script')[0];
  if (firstScript?.parentNode) {
    firstScript.parentNode.insertBefore(script, firstScript);
  } else {
    document.head.appendChild(script);
  }
}

/**
 * Loads and initialises the pixel if this host is allowed.
 * Safe to call repeatedly. Returns whether the pixel is live.
 *
 * Note: no PageView is fired here — <MetaPixel /> owns that so initial load and
 * SPA navigation go through one code path.
 */
export function initMetaPixel(): boolean {
  if (initialized) return true;
  if (!isMetaPixelAllowed()) return false;

  injectPixelScript();
  window.fbq?.('init', PIXEL_ID);
  initialized = true;
  return true;
}

/**
 * Records a conversion. No-ops on hosts where the pixel is not allowed.
 *
 * These initialise the pixel themselves rather than assuming <MetaPixel /> got
 * there first. A visitor who lands straight on /onboarding/register from an ad
 * can submit the form while auth hydration is still in flight, and that is the
 * conversion we most need — dropping it because of mount ordering would be the
 * worst possible failure. fbq queues calls made before fbevents.js finishes
 * loading, so nothing is lost either way.
 */
export function trackPixelEvent(event: MetaStandardEvent, params?: FbqParams): void {
  if (!initMetaPixel() || !window.fbq) return;
  window.fbq('track', event, params);
}

export function trackPixelCustomEvent(event: string, params?: FbqParams): void {
  if (!initMetaPixel() || !window.fbq) return;
  window.fbq('trackCustom', event, params);
}

/**
 * Fires an event at most once per browser session, keyed by dedupeKey.
 *
 * For intent signals like Lead, which are triggered by a component mounting:
 * StrictMode double-invokes effects in development, and a visitor who leaves
 * the form and comes back remounts it. Neither should inflate the conversion
 * count Meta optimises against. Not for events that genuinely can recur.
 */
export function trackPixelEventOnce(
  dedupeKey: string,
  event: MetaStandardEvent,
  params?: FbqParams,
): void {
  if (!isMetaPixelAllowed()) return;

  const storageKey = `mp_once_${dedupeKey}`;
  try {
    if (sessionStorage.getItem(storageKey)) return;
    sessionStorage.setItem(storageKey, '1');
  } catch {
    // Storage unavailable (private mode, blocked cookies) — better to send a
    // possible duplicate than to silently drop the conversion entirely.
  }

  trackPixelEvent(event, params);
}

export function trackPixelPageView(): void {
  trackPixelEvent('PageView');
}
