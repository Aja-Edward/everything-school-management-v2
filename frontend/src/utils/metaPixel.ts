/**
 * Meta (Facebook) Pixel — platform marketing site only.
 *
 * Nuventa is a single SPA build served from three kinds of host:
 *   1. the platform marketing site      (nuventacloud.com)
 *   2. tenant subdomains                (bayschool.nuventacloud.com)
 *   3. tenant custom domains            (bayschool.com)
 *
 * An unguarded snippet would fire on all three, shipping pageview data about
 * schoolchildren, parents and staff using their own school's portal to Meta —
 * a privacy problem, and one that also poisons the ad dataset with
 * existing-user traffic unrelated to acquisition. Every path here is therefore
 * behind a hostname allowlist, and tenant hosts request nothing from Meta.
 *
 * Responsibility is split with the inline snippet in index.html:
 *
 *   index.html  loads fbevents.js, calls init, fires the landing PageView.
 *               Inline because loading it from this bundle delayed the first
 *               PageView to roughly five seconds — bundle, awaited i18n init,
 *               React mount, auth hydration — losing fast bounces on paid
 *               traffic, and leaving no pixel in the page source for Meta's
 *               Event Setup Tool to find.
 *
 *   this module  route-change PageViews (via <MetaPixel />) and conversion
 *                events, which the inline snippet cannot know about.
 *
 * The allowlist and pixel id are duplicated in index.html by necessity: that
 * script runs before any bundle, so it cannot import from here. Keep them in
 * step.
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
    /** Set by the inline snippet in index.html once it has fired PageView. */
    __nuventaPixelBootstrapped?: boolean;
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
 * Ensures the pixel is live on an allowed host. Safe to call repeatedly.
 *
 * Fires no PageView: the landing one comes from index.html, and subsequent
 * ones from <MetaPixel /> on route change.
 */
export function initMetaPixel(): boolean {
  if (initialized) return true;
  if (!isMetaPixelAllowed()) return false;

  // On the marketing site the inline snippet in index.html has already loaded
  // fbevents.js and called init, so there is nothing to do but adopt it —
  // calling init again would register the same id twice.
  //
  // The injection path below still matters for hosts the inline guard does not
  // cover but VITE_META_PIXEL_HOSTS does, which is how the pixel can be
  // exercised locally without shipping localhost in the guard.
  // Read into a boolean rather than testing window.fbq inline: narrowing on
  // the property would make the init call below unreachable to the compiler,
  // since injectPixelScript assigns it through a side effect TS cannot see.
  const alreadyBootstrapped = Boolean(window.fbq);

  if (!alreadyBootstrapped) {
    injectPixelScript();
    window.fbq?.('init', PIXEL_ID);
  }

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
