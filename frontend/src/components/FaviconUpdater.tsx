import { useSettings } from '../contexts/SettingsContext';
import { useFavicon } from '../hooks/useFavicon';
import { getAbsoluteUrl } from '../utils/urlUtils';

const PLATFORM_FAVICON = '/nuventa-favicon.png';

const FaviconUpdater: React.FC = () => {
  const { settings } = useSettings();

  useFavicon({
    faviconUrl: getAbsoluteUrl(settings?.favicon),
    fallbackUrl: PLATFORM_FAVICON,
  });

  return null;
};

export default FaviconUpdater;
