import type { AppDataSnapshot, BrandingSettings, UserPrivateInfo, UserProfile } from '../types';
import {
  fetchFirestoreSnapshot,
  getFirestoreBranding,
  handleFirebaseApiRequest,
  saveFirestoreBranding,
  signOutFirebase,
  updateOwnProfile,
} from './firebaseBackend';
import { auth } from './firebase';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export function formatApiError(err: unknown, fallback = 'Terjadi kesalahan.'): string {
  const raw = err instanceof Error ? err.message : String(err || '');
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as { error?: string; operationType?: string; path?: string };
    if (parsed && typeof parsed.error === 'string') {
      if (parsed.error.toLowerCase().includes('insufficient permissions')) {
        return 'Izin Firestore ditolak. Pastikan akun Anda aktif dan memiliki hak akses yang sesuai.';
      }
      if (parsed.error.toLowerCase().includes('quota exceeded')) {
        return 'Kuota harian Firestore terlampaui. Silakan coba kembali besok atau tingkatkan paket proyek.';
      }
      return parsed.error;
    }
  } catch {
    // Not structured JSON error
  }
  return raw;
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  let bodyObj: Record<string, unknown> = {};
  if (typeof options.body === 'string' && options.body) {
    try {
      bodyObj = JSON.parse(options.body) as Record<string, unknown>;
    } catch {
      bodyObj = {};
    }
  }
  try {
    return await handleFirebaseApiRequest<T>(path, options.method || 'GET', bodyObj);
  } catch (err) {
    throw new ApiError(formatApiError(err, 'Permintaan gagal.'), 400);
  }
}

export const authApi = {
  logout: () => signOutFirebase(),
  updateProfile: async (
    payload: Record<string, unknown>
  ): Promise<{ passwordUpdated: boolean; profile: UserProfile; privateInfo: UserPrivateInfo }> => {
    try {
      return await updateOwnProfile(payload);
    } catch (err) {
      throw new ApiError(formatApiError(err, 'Gagal memperbarui profil.'), 400);
    }
  },
  fetchSnapshot: async (isAdminOverride?: boolean): Promise<AppDataSnapshot> => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      throw new ApiError('Sesi belum aktif.', 401);
    }
    return fetchFirestoreSnapshot(uid, Boolean(isAdminOverride));
  },
};

export const brandingApi = {
  get: () => getFirestoreBranding(),
  update: async (payload: BrandingSettings): Promise<BrandingSettings> => {
    try {
      return await saveFirestoreBranding(payload);
    } catch (err) {
      throw new ApiError(formatApiError(err, 'Gagal menyimpan identitas aplikasi.'), 400);
    }
  },
};
