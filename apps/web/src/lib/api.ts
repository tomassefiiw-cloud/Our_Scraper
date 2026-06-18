/**
 * API client — proxies to /api/* which Next.js rewrites to the backend.
 */
const TOKEN_KEY = 'tja_token';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (typeof window === 'undefined') return;
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function api<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = getToken();
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const res = await fetch(`/api${path}`, { ...init, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? 'Request failed');
  }
  if (res.status === 204) return null as T;
  return res.json() as Promise<T>;
}

export interface Job {
  id: string;
  title: string | null;
  titleAmharic: string | null;
  companyName: string | null;
  jobCategory: string | null;
  employmentType: string | null;
  workType: string | null;
  minExperienceYears: number | null;
  maxExperienceYears: number | null;
  location: string | null;
  locationCity: string | null;
  isRemote: boolean;
  salaryText: string | null;
  deadline: string | null;
  description: string | null;
  requirements: string[];
  responsibilities: string[];
  howToApply: string | null;
  applicationLink: string | null;
  applicationEmail: string | null;
  postedAt: string | null;
  aiConfidence: number | null;
  extractionMethod: string;
  channel?: { telegramUsername: string; displayName: string | null };
}

export interface FeedResponse {
  items: Job[];
  total: number;
  nextCursor: string | null;
  hasMore: boolean;
}

export const apiClient = {
  feed: (params: Record<string, string> = {}) => {
    const qs = new URLSearchParams(params).toString();
    return api<FeedResponse>(`/jobs${qs ? `?${qs}` : ''}`);
  },
  job: (id: string) => api<{ job: Job }>(`/jobs/${id}`),
  interact: (id: string, action: string) =>
    api(`/jobs/${id}/interact`, { method: 'POST', body: JSON.stringify({ action }) }),
  saved: () => api<{ items: Job[] }>(`/jobs/saved/all`),
  login: (email: string, password: string) =>
    api<{ token: string }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  signup: (email: string, password: string, displayName?: string) =>
    api<{ token: string }>('/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email, password, displayName }),
    }),
  prefs: () => api<{ prefs: unknown }>('/prefs'),
  updatePrefs: (prefs: unknown) =>
    api<{ prefs: unknown }>('/prefs', { method: 'PUT', body: JSON.stringify(prefs) }),
  channels: () => api<{ channels: unknown[] }>('/channels'),
  adminStats: () => api<{ totals: unknown; extractionMethods: unknown; aiProviders: unknown }>('/admin/stats'),
  adminRecentJobs: () => api<{ jobs: Job[] }>('/admin/jobs/recent'),
  adminChannelsHealth: () => api<{ channels: unknown[] }>('/admin/channels/health'),
  scrapeLogs: () => api<{ logs: unknown[] }>('/scrape/logs'),
  triggerScrape: (channel?: string) =>
    api<{ status: string; count?: number }>('/scrape/trigger', {
      method: 'POST',
      body: JSON.stringify({ channel }),
    }),
  aiProviders: () => api<{ configs: unknown[] }>('/settings/ai-providers'),
  subscribePush: (sub: PushSubscriptionJSON) =>
    api('/push/subscribe', { method: 'POST', body: JSON.stringify(sub) }),
};
