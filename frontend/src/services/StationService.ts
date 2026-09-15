/**
 * The exam station: this app running on a computer on a school's own network,
 * for sitting CBT papers without the internet (/api/cbt/station/).
 *
 * Staff pages send the station key in X-Station-Key. The shared `api` client
 * would treat a refusal as an expired login and send the browser to /login, so
 * these calls use fetch directly.
 */

import { API_BASE_URL } from './api';

export interface StationPaper {
  package: string;
  paper: number;
  exam_title: string;
  subject: string;
  opens_at: string;
  closes_at: string;
  duration_minutes: number;
  is_open: boolean;
  students: number;
}

export interface StationStatus {
  station: true;
  server_time: string;
  school: { name: string; slug: string } | null;
  papers: StationPaper[];
}

export class StationError extends Error {
  constructor(message: string, public status: number, public code?: string) {
    super(message);
  }
}

/** Set on a browser that has used the station, so the exam page sends students back to it. */
const STATION_FLAG = 'cbtStation';
const KEY_STORAGE = 'cbtStationKey';

const request = async <T>(method: string, path: string, body?: unknown, key?: string): Promise<T> => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (key) headers['X-Station-Key'] = key;
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/cbt/station/${path}`, {
      method, headers, credentials: 'include', body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new StationError("Can't reach the exam station. Check this computer is on the school network.", 0);
  }
  const text = await response.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // An HTML page: most likely not a station at all.
  }
  if (!response.ok || data === null) {
    if (response.status === 404 && !data?.code) {
      throw new StationError("This computer isn't set up as an exam station.", 404, 'not_station');
    }
    if (response.status === 429 || (response.status === 403 && !data?.code)) {
      throw new StationError('Too many tries. Wait a minute, then try again.', response.status, 'rate_limited');
    }
    throw new StationError(data?.detail || `The station answered ${response.status}.`, response.status, data?.code);
  }
  return data as T;
};

/** After signing in, the rest of the app sends this school's slug, and loads the page afresh to pick up the login. */
const enter = (tenantSlug: string, path: string) => {
  localStorage.setItem('tenantSlug', tenantSlug);
  localStorage.setItem(STATION_FLAG, '1');
  localStorage.removeItem('userData');
  window.location.assign(path);
};

export const StationService = {
  isStationBrowser: () => localStorage.getItem(STATION_FLAG) === '1',

  status: () => request<StationStatus>('GET', ''),

  async studentSignIn(packageId: string, number: string, pin: string) {
    const result = await request<{ paper: number; tenant_slug: string }>(
      'POST', 'sign-in/', { package: packageId, number, pin });
    enter(result.tenant_slug, `/student/cbt/${result.paper}`);
  },

  async signOut(to = '/station') {
    try {
      await request('POST', 'sign-out/');
    } finally {
      localStorage.removeItem('userData');
      window.location.assign(to);
    }
  },

  async staffSignIn(key: string, paper: number) {
    const result = await request<{ tenant_slug: string }>('POST', 'staff/sign-in/', { key });
    enter(result.tenant_slug, `/station/board/${paper}`);
  },

  /** The key is kept for this browser tab only. */
  savedKey: () => sessionStorage.getItem(KEY_STORAGE) || '',
  saveKey: (key: string) => sessionStorage.setItem(KEY_STORAGE, key),
  forgetKey: () => sessionStorage.removeItem(KEY_STORAGE),

  checkKey: (key: string) => request<{ key: 'right' }>('POST', 'staff/key/', { key }),

  loadPackage: (key: string, content: unknown) =>
    request<StationStatus & { loaded: string }>('POST', 'packages/', content, key),

  results: (key: string, packageId: string) =>
    request<{ attempts: unknown[]; still_in_progress: number; voided: number; exam_title: string }>(
      'GET', `packages/${packageId}/results/`, undefined, key),

  moveWindow: (key: string, packageId: string, opensAt: string, closesAt: string) =>
    request<StationStatus>('POST', `packages/${packageId}/window/`, { opens_at: opensAt, closes_at: closesAt }, key),
};

export default StationService;
