import type { AppDataSnapshot, UserPrivateInfo, UserProfile } from '../types';

const TOKEN_STORAGE_KEY = 'sipalak_session_token';

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

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  tokenOverride?: string | null
): Promise<T> {
  const token = tokenOverride !== undefined ? tokenOverride : getStoredToken();
  const headers = new Headers(options.headers);
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(path, { ...options, headers });
  const text = await res.text();
  let parsed: Record<string, unknown> = {};
  if (text) {
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
