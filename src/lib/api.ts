import type { AppDataSnapshot, BrandingSettings, UserPrivateInfo, UserProfile } from '../types';
import { handleLocalApiRequest } from './localBackend';

const TOKEN_STORAGE_KEY = 'sipalak_session_token';

export type BackendMode = 'server' | 'local';

let resolvedMode: BackendMode | null = null;
let probePromise: Promise<BackendMode> | null = null;

function getApiBaseUrl(): string {
  const configured = import.meta.env.VITE_API_BASE_URL;
  if (typeof configured === 'string' && configured.trim()) {
    return configured.trim().replace(/\/+$/, '');
  }
  return '';
}

export function getWsUrl(): string {
  const base = getApiBaseUrl();
  if (base) {
    return `${base.replace(/^http/i, 'ws')}/ws`;
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws`;
}

export function getBackendMode(): BackendMode {
  return resolvedMode ?? 'server';
}

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    // Ignore storage quota / privacy mode errors
  }
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function tryProbeServerOnce(): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(`${getApiBaseUrl()}/api/auth/bootstrap-status`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    const contentType = res.headers.get('content-type') || '';
    if (!res.ok || !contentType.includes('application/json')) {
      return false;
    }
    const json = (await res.json()) as { needsSetup?: unknown };
    return typeof json.needsSetup === 'boolean';
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function probeBackend(force = false): Promise<BackendMode> {
  if (!force && resolvedMode) return resolvedMode;
  if (!force && probePromise) return probePromise;

  probePromise = (async () => {
    let serverReachable = await tryProbeServerOnce();
    if (!serverReachable) {
      await new Promise((r) => setTimeout(r, 500));
      serverReachable = await tryProbeServerOnce();
    }
    resolvedMode = serverReachable ? 'server' : 'local';
    probePromise = null;
    return resolvedMode;
  })();

  return probePromise;
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  tokenOverride?: string | null
): Promise<T> {
  const mode = await probeBackend();
  const token = tokenOverride !== undefined ? tokenOverride : getStoredToken();

  if (mode === 'local') {
    let bodyObj: Record<string, unknown> = {};
    if (typeof options.body === 'string' && options.body) {
      try {
        bodyObj = JSON.parse(options.body) as Record<string, unknown>;
      } catch {
        bodyObj = {};
      }
    }
    try {
      return await handleLocalApiRequest<T>(path, options.method || 'GET', bodyObj, token);
    } catch (err) {
      const status =
        typeof (err as { status?: unknown })?.status === 'number'
          ? (err as { status: number }).status
          : 400;
      const msg = err instanceof Error ? err.message : 'Permintaan gagal';
      throw new ApiError(msg, status);
    }
  }

  const headers = new Headers(options.headers);
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  let res: Response;
  try {
    res = await fetch(`${getApiBaseUrl()}${path}`, { ...options, headers });
  } catch {
    throw new ApiError('Koneksi ke server SIPALAK terputus. Coba muat ulang.', 503);
  }

  const contentType = res.headers.get('content-type') || '';
  const text = await res.text();
  let parsed: Record<string, unknown> = {};
  if (text && contentType.includes('application/json')) {
    try {
      parsed = JSON.parse(text) as Record<string, unknown>;
    } catch {
      parsed = {};
    }
  } else if (text) {
    try {
      parsed = JSON.parse(text) as Record<string, unknown>;
    } catch {
      parsed = {};
    }
  }

  if (!res.ok) {
    const message =
      typeof parsed.error === 'string' && parsed.error
        ? parsed.error
        : `Permintaan gagal (${res.status})`;
    throw new ApiError(message, res.status);
  }

  return parsed as T;
}

export interface AuthSessionResponse {
  token: string;
  profile: UserProfile;
  privateInfo: UserPrivateInfo;
}

export interface AuthMeResponse {
  profile: UserProfile;
  privateInfo: UserPrivateInfo;
}

export const authApi = {
  bootstrapStatus: () => apiFetch<{ needsSetup: boolean }>('/api/auth/bootstrap-status', {}, null),
  bootstrap: (payload: {
    displayName: string;
    username: string;
    password: string;
    email?: string;
    unit?: string;
  }) =>
    apiFetch<AuthSessionResponse>(
      '/api/auth/bootstrap',
      { method: 'POST', body: JSON.stringify(payload) },
      null
    ),
  login: (payload: { identifier: string; password: string }) =>
    apiFetch<AuthSessionResponse>(
      '/api/auth/login',
      { method: 'POST', body: JSON.stringify(payload) },
      null
    ),
  logout: () => apiFetch<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),
  me: () => apiFetch<AuthMeResponse>('/api/auth/me'),
  updateProfile: (payload: Record<string, unknown>) =>
    apiFetch<{ passwordUpdated: boolean; profile: UserProfile; privateInfo: UserPrivateInfo }>(
      '/api/auth/profile',
      { method: 'PUT', body: JSON.stringify(payload) }
    ),
  fetchSnapshot: () => apiFetch<AppDataSnapshot>('/api/data'),
};

export const brandingApi = {
  get: () => apiFetch<BrandingSettings>('/api/settings/branding', {}, null),
  update: (payload: BrandingSettings) =>
    apiFetch<BrandingSettings>('/api/settings/branding', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
};
