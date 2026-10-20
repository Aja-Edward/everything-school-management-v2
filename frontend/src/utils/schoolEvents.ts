import api from '@/services/api';

/** A school website event as /events/events/ returns it. */
export interface SchoolEvent {
  id: number;
  title: string;
  subtitle?: string;
  description?: string;
  badge_text?: string;
  display_type: 'banner' | 'carousel' | 'ribbon';
  event_type: string;
  background_theme: string;
  ribbon_text?: string;
  ribbon_speed?: 'slow' | 'medium' | 'fast';
  is_active: boolean;
  is_published: boolean;
  is_current?: boolean;
  start_date?: string | null;
  end_date?: string | null;
  updated_at?: string;
  cta_text?: string;
  cta_url?: string;
  images?: { id: number; image: string; image_url?: string | null; order?: number }[];
}

/**
 * The event's picture. The API sends a list of images, not one `image`, so
 * reading `event.image` always came back empty and banners had no picture.
 */
export const eventImage = (e: SchoolEvent): string | undefined => {
  const first = [...(e.images ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))[0];
  return first?.image_url || first?.image || undefined;
};

/** Active, published, and inside its start/end dates if it has any. */
export const isLive = (e: SchoolEvent): boolean => {
  if (!e.is_active || !e.is_published) return false;
  const now = Date.now();
  if (e.start_date && new Date(e.start_date).getTime() > now) return false;
  if (e.end_date && new Date(e.end_date).getTime() < now) return false;
  return true;
};

/** The school's events that should be showing right now. */
export const fetchLiveEvents = async (): Promise<SchoolEvent[]> => {
  const data: any = await api.get('/events/events/?is_active=true&is_published=true');
  const list: SchoolEvent[] = data?.results ?? data ?? [];
  return Array.isArray(list) ? list.filter(isLive) : [];
};
