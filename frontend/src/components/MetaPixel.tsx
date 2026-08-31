import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { initMetaPixel, trackPixelPageView } from '@/utils/metaPixel';

/**
 * Loads the Meta Pixel and reports PageView on every client-side navigation.
 *
 * Two gates, both deliberate:
 *
 *  - Host. Handled inside initMetaPixel() by an allowlist, so the script is
 *    never even requested on tenant subdomains, tenant custom domains,
 *    localhost or preview builds. See utils/metaPixel.ts.
 *
 *  - Authentication. Signed-in users are existing customers, not ad prospects.
 *    Tracking them tells Meta nothing useful about acquisition and needlessly
 *    ships their session activity to a third party. We wait for auth hydration
 *    to settle before firing anything, so a returning admin does not leak a
 *    PageView in the gap before their session is restored.
 *
 * Renders nothing. Mounted once in RootLayout, inside AuthProvider.
 */
const MetaPixel: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();
  const { pathname } = useLocation();
  const lastTrackedPath = useRef<string | null>(null);

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
