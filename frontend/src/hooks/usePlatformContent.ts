import { useEffect, useState } from 'react';
import api from '@/services/api';

/**
 * The marketing site's editable copy and contact details (Platform admin ->
 * Site Content). Fetched once per page load and shared by every section that
 * needs it, so the homepage, footer and WhatsApp button don't each ask.
 *
 * Only for the main marketing domain: a school's own subdomain has its own
 * settings and never shows these.
 */

export interface PlatformStat { value: string; label: string; }

export interface PlatformContent {
  about_stats: PlatformStat[];
  contact_email: string;
  contact_phone: string;
  contact_address: string;
  contact_office_hours: string;
  contact_whatsapp: string;
}

export const DEFAULT_SUPPORT_EMAIL = 'support@nuventacloud.com';

const EMPTY: PlatformContent = {
  about_stats: [],
  contact_email: '',
  contact_phone: '',
  contact_address: '',
  contact_office_hours: '',
  contact_whatsapp: '',
};

let pending: Promise<PlatformContent> | null = null;

const load = (): Promise<PlatformContent> => {
  if (!pending) {
    pending = api.get('/api/tenants/platform-content/')
      .then((res: Partial<PlatformContent>) => ({
        ...EMPTY,
        ...res,
        about_stats: Array.isArray(res?.about_stats) ? res.about_stats : [],
      }))
      .catch(() => {
        pending = null; // let a later page try again
        return EMPTY;
      });
  }
  return pending;
};

export const usePlatformContent = () => {
  const [content, setContent] = useState<PlatformContent>(EMPTY);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    load().then((c) => {
      if (alive) {
        setContent(c);
        setLoaded(true);
      }
    });
    return () => { alive = false; };
  }, []);

  return { content, loaded, email: content.contact_email || DEFAULT_SUPPORT_EMAIL };
};

/** wa.me link for the platform's WhatsApp number, or null when none is set. */
export const whatsappLink = (number: string, text?: string): string | null => {
  const digits = number.replace(/\D/g, '');
  if (!digits) return null;
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
};
