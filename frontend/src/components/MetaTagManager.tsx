import { useEffect } from 'react';
import { useTenant } from '../contexts/TenantContext';
import { useSettings } from '../contexts/SettingsContext';
import { getAbsoluteUrl } from '../utils/urlUtils';

const PLATFORM_NAME = 'Nuventa Cloud';
const PLATFORM_DESCRIPTION = 'The all-in-one cloud school management platform built for modern schools.';
const PLATFORM_LOGO = 'https://www.nuventacloud.com/nuventa-logo.png';
const PLATFORM_URL = 'https://www.nuventacloud.com/';

function setMeta(property: string, content: string) {
  let el = document.querySelector<HTMLMetaElement>(`meta[property="${property}"]`)
    ?? document.querySelector<HTMLMetaElement>(`meta[name="${property}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(
      property.startsWith('og:') ? 'property' : 'name',
      property
    );
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

const MetaTagManager: React.FC = () => {
  const { tenant, isSubdomain } = useTenant();
  const { settings } = useSettings();

  useEffect(() => {
    const isTenantDomain = !!tenant && !isSubdomain;

    const title = isTenantDomain ? (tenant.name ?? PLATFORM_NAME) : PLATFORM_NAME;

    const description = isTenantDomain
      ? (settings?.motto ?? PLATFORM_DESCRIPTION)
      : PLATFORM_DESCRIPTION;

    const image = isTenantDomain && settings?.logo
      ? getAbsoluteUrl(settings.logo)
      : PLATFORM_LOGO;

    const url = isTenantDomain ? window.location.origin + '/' : PLATFORM_URL;

    document.title = title;

    setMeta('og:title', title);
    setMeta('og:description', description);
    setMeta('og:image', image);
    setMeta('og:url', url);
    setMeta('og:site_name', isTenantDomain ? title : PLATFORM_NAME);
    setMeta('twitter:title', title);
    setMeta('twitter:description', description);
    setMeta('twitter:image', image);
    setMeta('description', description);
  }, [tenant, settings, isSubdomain]);

  return null;
};

export default MetaTagManager;
