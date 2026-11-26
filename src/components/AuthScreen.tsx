import React, { useState } from 'react';
import { ArrowRight, Building2, IdCard, LogOut, Monitor, Phone, ShieldCheck, User } from 'lucide-react';
import {
  completeSelfRegistration,
  signInWithGoogle,
  signOutFirebase,
} from '../lib/firebaseBackend';
import { formatApiError } from '../lib/api';
import { DEFAULT_BRANDING, type BrandingSettings, type SystemRole, type UserPrivateInfo, type UserProfile } from '../types';
import firebaseConfig from '../../firebase-applet-config.json';

interface AuthScreenProps {
  branding?: BrandingSettings;
  initialNotice?: string | null;
  onboardingUser?: { email: string; displayName: string } | null;
  onAuthenticated: (profile: UserProfile, privateInfo: UserPrivateInfo) => void;
  onCancelOnboarding?: () => void;
}

const SELF_ROLE_OPTIONS: { value: SystemRole; label: string }[] = [
  { value: 'guru', label: 'Guru' },
  { value: 'siswa', label: 'Siswa' },
  { value: 'pengguna', label: 'Pengguna Umum' },
];

export const AuthScreen: React.FC<AuthScreenProps> = ({
  branding = DEFAULT_BRANDING,
  initialNotice,
  onboardingUser,
  onAuthenticated,
  onCancelOnboarding,
}) => {
  const [displayName, setDisplayName] = useState(onboardingUser?.displayName || '');
  const [role, setRole] = useState<SystemRole>('guru');
  const [unit, setUnit] = useState('Lab Komputer Akuntansi');
  const [idNumber, setIdNumber] = useState('');
  const [phone, setPhone] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(initialNotice ?? null);
  const [unauthorizedHost, setUnauthorizedHost] = useState<string | null>(null);

  React.useEffect(() => {
    if (onboardingUser) {
      setDisplayName(onboardingUser.displayName || '');
    }
  }, [onboardingUser]);

  React.useEffect(() => {
    if (initialNotice) {
      setError(initialNotice);
    }
  }, [initialNotice]);

  const handleGoogleSignIn = async () => {
    setError(null);
    setUnauthorizedHost(null);
    setLoading(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        setError('Proses masuk dibatalkan.');
      } else if (code === 'auth/unauthorized-domain') {
        const host = typeof window !== 'undefined' ? window.location.hostname : '';
        setUnauthorizedHost(host || 'domain-anda');
        setError(
          `Domain "${host}" belum didaftarkan di Firebase Authentication → Settings → Authorized domains.`
        );
      } else {
        setError(formatApiError(err, 'Gagal masuk dengan Google.'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleOnboardingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await completeSelfRegistration({
        displayName,
        role,
        unit,
        idNumber,
        phone,
      });
      onAuthenticated(res.profile, res.privateInfo);
    } catch (err) {
      setError(formatApiError(err, 'Gagal menyimpan profil awal.'));
    } finally {
      setLoading(false);
    }
  };

  const handleSwitchAccount = async () => {
    setError(null);
    await signOutFirebase();
    onCancelOnboarding?.();
  };

  return (
    <div className="min-h-screen sipalak-auth-bg text-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-slate-900/88 backdrop-blur-xl border border-white/12 rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-6 pt-7 pb-6 border-b border-white/10 bg-gradient-to-br from-slate-900/90 via-[#0f213a]/85 to-sky-950/60">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-11 h-11 rounded-xl bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
              <Monitor className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white">{branding.appName}</h1>
              <p className="text-xs text-slate-400">{branding.schoolName}</p>
            </div>
          </div>
          <p className="text-sm text-slate-300">
            {onboardingUser
              ? `Lengkapi profil untuk akun ${onboardingUser.email}`
              : `${branding.appSubtitle} — Data tersimpan permanen lintas perangkat.`}
          </p>
        </div>

        <div className="p-6">
          {error && (
            <div className="mb-4 rounded-xl bg-rose-500/10 border border-rose-500/30 px-3.5 py-2.5 text-sm text-rose-300 space-y-2">
              <p>{error}</p>
              {unauthorizedHost && (
                <div className="text-xs text-rose-200/90 space-y-1 pt-1 border-t border-rose-500/20">
                  <p>
                    Tambahkan domain <span className="font-mono font-semibold">{unauthorizedHost}</span>{' '}
                    pada project <span className="font-mono">{firebaseConfig.projectId}</span>:
                  </p>
                  <a
                    href={`https://console.firebase.google.com/project/${firebaseConfig.projectId}/authentication/settings`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-block underline text-sky-300 hover:text-sky-200 break-all"
                  >
                    Buka Firebase Console → Authentication → Settings
                  </a>
                </div>
              )}
            </div>
          )}

          {onboardingUser ? (
            <form onSubmit={handleOnboardingSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Nama Lengkap *
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Nama lengkap Anda"
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Peran Akun *
                </label>
                <div className="relative">
                  <ShieldCheck className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as SystemRole)}
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white focus:outline-none focus:border-indigo-500"
                  >
                    {SELF_ROLE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Kelas / Unit *
                </label>
                <div className="relative">
                  <Building2 className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    placeholder="cth. XI TKJ 1 / Lab Akuntansi"
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    NIP / NIS
                  </label>
                  <div className="relative">
                    <IdCard className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={idNumber}
                      onChange={(e) => setIdNumber(e.target.value)}
                      placeholder="Opsional"
                      className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    No. Telepon
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="Opsional"
                      className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleSwitchAccount}
                  disabled={loading}
                  className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                  Ganti Akun
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  {loading ? 'Menyimpan...' : 'Simpan & Masuk'}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-4">
              <p className="text-xs text-slate-400 leading-relaxed">
                Masuk menggunakan akun Google Anda agar semua data inventaris, peminjaman, jadwal,
                dan laporan tersimpan permanen serta dapat dibuka dari perangkat mana saja.
              </p>
              <button
                type="button"
                disabled={loading}
                onClick={handleGoogleSignIn}
                className="w-full py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white font-semibold text-sm flex items-center justify-center gap-2.5 transition-colors cursor-pointer shadow-lg shadow-indigo-950/40"
              >
                <span>{loading ? 'Memproses...' : 'Masuk'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
