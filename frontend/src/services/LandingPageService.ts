import api from './api';
import { API_BASE_URL } from './api';

// ─── Types ────────────────────────────────────────────────────────────────────

export type HeroType = 'static' | 'carousel';
export type SectionType = 'about' | 'admissions' | 'contact' | 'custom';
export type LinkType = 'internal' | 'section' | 'external';
export type RibbonSpeed = 'slow' | 'medium' | 'fast';

export interface NavigationLink {
  id: number;
  label: string;
  url: string;
  link_type: LinkType;
  open_in_new_tab: boolean;
  is_enabled: boolean;
  display_order: number;
}

export interface LandingSection {
  id: number;
  section_type: SectionType;
  title: string;
  subtitle?: string;
  content?: string;
  image?: string;
  is_enabled: boolean;
  display_order: number;
  // contact
  contact_address?: string;
  contact_phone?: string;
  contact_email?: string;
  contact_hours?: string;
  contact_map_embed?: string;
  // admissions
  admissions_deadline?: string;
  admissions_fee?: string;
  admissions_contact_name?: string;
  admissions_contact_email?: string;
  admissions_contact_phone?: string;
}

export interface TenantLandingPage {
  id: number;
  is_published: boolean;
  hero_type: HeroType;
  hero_image?: string;
  hero_title?: string;
  hero_subtitle?: string;
  hero_cta_text: string;
  hero_cta_url: string;
  hero_secondary_cta_text?: string;
  hero_secondary_cta_url?: string;
  ribbon_enabled: boolean;
  ribbon_text?: string;
  ribbon_speed: RibbonSpeed;
  footer_text?: string;
  facebook_url?: string;
  twitter_url?: string;
  instagram_url?: string;
  youtube_url?: string;
  sections: LandingSection[];
  nav_links: NavigationLink[];
}

// ─── Service ──────────────────────────────────────────────────────────────────

const BASE = '/school-settings/landing';

const LandingPageService = {
  /** Public: fetch published landing page (no auth required) */
  getPublic: (): Promise<TenantLandingPage> =>
    api.get(BASE + '/'),

  /** Admin: fetch landing page including unpublished */
  getAdmin: (): Promise<TenantLandingPage> =>
    api.get(BASE + '/admin/'),

  /** Admin: update top-level landing page settings */
  update: (data: Partial<TenantLandingPage>): Promise<TenantLandingPage> =>
    api.patch(BASE + '/', data),

  /** Upload hero image */
  uploadHeroImage: async (file: File): Promise<string> => {
    const form = new FormData();
    form.append('image', file);
    const tenantSlug = localStorage.getItem('tenantSlug');
    const csrfCookie = document.cookie.split('; ').find(r => r.startsWith('csrftoken='))?.split('=')[1] ?? '';
    const res = await fetch(`${API_BASE_URL}/school-settings/landing/upload-hero/`, {
      method: 'POST',
      body: form,
      credentials: 'include',
      headers: {
        ...(tenantSlug ? { 'X-Tenant-Slug': tenantSlug } : {}),
        ...(csrfCookie ? { 'X-CSRFToken': csrfCookie } : {}),
      },
    });
    const data = await res.json();
    return data.url as string;
  },

  // ── Sections ──────────────────────────────────────────────────────────────

  getSections: (): Promise<LandingSection[]> =>
    api.get(BASE + '/sections/'),

  createSection: (data: Partial<LandingSection>): Promise<LandingSection> =>
    api.post(BASE + '/sections/', data),

  updateSection: (id: number, data: Partial<LandingSection>): Promise<LandingSection> =>
    api.patch(BASE + `/sections/${id}/`, data),

  deleteSection: (id: number): Promise<void> =>
    api.delete(BASE + `/sections/${id}/`),

  reorderSections: (items: { id: number; display_order: number }[]): Promise<void> =>
    api.post(BASE + '/sections/reorder/', items),

  uploadSectionImage: async (id: number, file: File): Promise<string> => {
    const form = new FormData();
    form.append('image', file);
    const res = await fetch(
      `${API_BASE_URL}/school-settings/landing/sections/${id}/upload_image/`,
      { method: 'POST', body: form, credentials: 'include' }
    );
    const data = await res.json();
    return data.url as string;
  },

  // ── Navigation Links ──────────────────────────────────────────────────────

  getNavLinks: (): Promise<NavigationLink[]> =>
    api.get(BASE + '/nav-links/'),

  createNavLink: (data: Partial<NavigationLink>): Promise<NavigationLink> =>
    api.post(BASE + '/nav-links/', data),

  updateNavLink: (id: number, data: Partial<NavigationLink>): Promise<NavigationLink> =>
    api.patch(BASE + `/nav-links/${id}/`, data),

  deleteNavLink: (id: number): Promise<void> =>
    api.delete(BASE + `/nav-links/${id}/`),

  reorderNavLinks: (items: { id: number; display_order: number }[]): Promise<void> =>
    api.post(BASE + '/nav-links/reorder/', items),
};

export default LandingPageService;
