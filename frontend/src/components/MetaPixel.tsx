import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { initMetaPixel, trackPixelPageView } from '@/utils/metaPixel';

/**
 * Reports PageView on client-side navigation.
 *
 * The landing PageView is not ours: the inline snippet in index.html fires it
 * before this bundle exists, which is what keeps fast bounces on paid traffic
 * from going uncounted. This component picks up from the first route change,
 * which the inline snippet cannot see in an SPA.
 *
 * Two gates, both deliberate:
 *
 *  - Host. Handled inside initMetaPixel() by an allowlist, so nothing is
 *    requested from Meta on tenant subdomains, tenant custom domains,
 *    localhost or preview builds. See utils/metaPixel.ts.
 *
 *  - Authentication. Signed-in users are existing customers, not ad prospects.
 *    Tracking their navigation tells Meta nothing about acquisition and ships
 *    session activity to a third party for no gain. This only covers route
 *    changes — the landing PageView fires before auth is knowable, which is the
 *    price of firing it early enough to be useful.
 *
 * Renders nothing. Mounted once in RootLayout, inside AuthProvider.
 */
const MetaPixel: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();
  const { pathname } = useLocation();
  // Seeded with the landing path when index.html already reported it, so the
  // first effect run is a no-op instead of a duplicate. Left null when the
  // inline snippet did not run (a host reached only via VITE_META_PIXEL_HOSTS),
  // so local testing still sees an initial PageView.
  const lastTrackedPath = useRef<string | null>(
    typeof window !== 'undefined' && window.__nuventaPixelBootstrapped
      ? window.location.pathname
      : null,
  );

  useEffect(() => {
    // Auth state not settled yet — don't guess.
    if (isLoading) return;
    if (isAuthenticated) return;

    if (!initMetaPixel()) return;

    // Guards against React 18 StrictMode's double effect and against
    // re-firing when only the query string or hash changed.
    if (lastTrackedPath.current === pathname) return;
    lastTrackedPath.current = pathname;

    trackPixelPageView();
  }, [pathname, isAuthenticated, isLoading]);

  return null;
};

export default MetaPixel;
