import React, { useState } from 'react';
import { ArrowLeft, Eye, EyeOff, LogOut } from 'lucide-react';
import {
  completeSelfRegistration,
  registerWithUsernamePassword,
  signInAndResolveSession,
  signOutFirebase,
} from '../lib/firebaseBackend';
import { formatApiError } from '../lib/api';
import {
  DEFAULT_BRANDING,
  type BrandingSettings,
  type SystemRole,
  type UserPrivateInfo,
  type UserProfile,
} from '../types';
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
  const [mode, setMode] = useState<'login' | 'register'>('login');

  // Login fields
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Registration / onboarding fields
  const [displayName, setDisplayName] = useState(onboardingUser?.displayName || '');
  const [username, setUsername] = useState('');
  const [role, setRole] = useState<SystemRole>('guru');
  const [unit, setUnit] = useState('Lab Komputer Akuntansi');
  const [idNumber, setIdNumber] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(initialNotice ?? null);
  const [unauthorizedHost, setUnauthorizedHost] = useState<string | null>(null);
  const [needsEmailPasswordProvider, setNeedsEmailPasswordProvider] = useState(false);

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

  const resetErrors = () => {
    setError(null);
    setUnauthorizedHost(null);
    setNeedsEmailPasswordProvider(false);
  };

  const handleAuthException = (err: unknown, fallback: string) => {
    const code = (err as { code?: string })?.code;
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
      setError('Proses masuk dibatalkan.');
    } else if (code === 'auth/unauthorized-domain') {
      const host = typeof window !== 'undefined' ? window.location.hostname : '';
      setUnauthorizedHost(host || 'domain-anda');
      setError(
        `Domain "${host}" belum didaftarkan di Firebase Authentication → Settings → Authorized domains.`
      );
    } else if (code === 'auth/operation-not-allowed') {
      setNeedsEmailPasswordProvider(true);
      setError(
        'Metode login Email/Password belum diaktifkan di Firebase Console. Aktifkan terlebih dahulu agar login Nama pengguna & Kata sandi dapat digunakan.'
      );
    } else if (
      code === 'auth/invalid-credential' ||
      code === 'auth/wrong-password' ||
      code === 'auth/user-not-found'
    ) {
      setError('Nama pengguna atau kata sandi salah.');
    } else if (code === 'auth/email-already-in-use') {
      setError('Nama pengguna atau email tersebut sudah terdaftar.');
    } else if (code === 'auth/weak-password') {
      setError('Kata sandi minimal 6 karakter.');
    } else if (code === 'auth/too-many-requests') {
      setError('Terlalu banyak percobaan gagal. Silakan tunggu sebentar dan coba lagi.');
    } else {
      setError(formatApiError(err, fallback));
    }
  };

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    resetErrors();
    setLoading(true);
    try {
      const res = await signInAndResolveSession(identifier, password);
      if (res.status === 'ready') {
        onAuthenticated(res.profile, res.privateInfo);
      }
    } catch (err) {
      handleAuthException(err, 'Gagal masuk ke sistem.');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    resetErrors();
    setLoading(true);
    try {
      const res = await registerWithUsernamePassword({
        displayName,
        username,
        password: regPassword,
        role,
        unit,
        idNumber,
        phone,
        email,
      });
      onAuthenticated(res.profile, res.privateInfo);
    } catch (err) {
      handleAuthException(err, 'Gagal mendaftarkan akun.');
    } finally {
      setLoading(false);
    }
  };

  const handleOnboardingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    resetErrors();
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
    resetErrors();
    await signOutFirebase();
    onCancelOnboarding?.();
  };

  const headingTitle = onboardingUser
    ? 'Lengkapi Profil Akun'
    : mode === 'register'
      ? 'Daftar Akun Baru'
      : 'Masuk ke Sistem';

  return (
    <div className="min-h-screen sipalak-auth-bg flex items-center justify-center p-4">
      <div className="w-full max-w-[400px] bg-white rounded-2xl shadow-2xl border border-slate-200/80 p-7 sm:p-8 text-slate-900">
        <div>
          <div className="flex items-center gap-3.5">
            {branding.logoDataUrl && (
              <img
                src={branding.logoDataUrl}
                alt={branding.appName}
                className="w-16 h-16 rounded-xl object-contain bg-slate-50 border border-slate-200 p-1.5 shrink-0"
              />
            )}
            <div className="min-w-0">
              <h1 className="text-[20px] font-extrabold tracking-tight text-[#1a2b4c] leading-tight">
                {branding.appName}
              </h1>
              <p className="text-[12px] text-slate-500 mt-0.5 leading-snug">
                {branding.appSubtitle}
              </p>
              <p className="text-[12px] font-medium text-slate-600 leading-snug">
                {branding.schoolName}
              </p>
            </div>
          </div>
          <h2 className="text-[19px] font-bold text-slate-900 mt-4 leading-snug">
            {headingTitle}
          </h2>
        </div>

        {error && (
          <div className="mt-4 rounded-xl bg-rose-50 border border-rose-200 px-3.5 py-2.5 text-xs text-rose-700 space-y-1.5">
            <p className="font-medium leading-relaxed">{error}</p>
            {unauthorizedHost && (
              <div className="pt-1 border-t border-rose-200/80 space-y-1">
                <p>
                  Tambahkan <span className="font-mono font-semibold">{unauthorizedHost}</span> ke
                  Authorized domains:
                </p>
                <a
                  href={`https://console.firebase.google.com/project/${firebaseConfig.projectId}/authentication/settings`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block underline font-medium text-blue-700 hover:text-blue-800 break-all"
                >
                  Buka Firebase Console → Authentication → Settings
                </a>
              </div>
            )}
            {needsEmailPasswordProvider && (
              <div className="pt-1 border-t border-rose-200/80 space-y-1">
                <a
                  href={`https://console.firebase.google.com/project/${firebaseConfig.projectId}/authentication/providers`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block underline font-medium text-blue-700 hover:text-blue-800 break-all"
                >
                  Aktifkan Email/Password di Firebase Console → Sign-in method
                </a>
              </div>
            )}
          </div>
        )}

        {onboardingUser ? (
          <form onSubmit={handleOnboardingSubmit} className="mt-5 space-y-3.5">
            <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
              Akun Google: <span className="font-medium text-slate-700">{onboardingUser.email}</span>
            </p>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Nama Lengkap *
              </label>
              <input
                type="text"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Nama lengkap Anda"
                className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-slate-900"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Peran Akun *
              </label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as SystemRole)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-sm text-slate-900 focus:outline-none focus:border-slate-900"
              >
                {SELF_ROLE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Kelas / Unit *
              </label>
              <input
                type="text"
                required
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="cth. XI TKJ 1 / Lab Akuntansi"
                className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-slate-900"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  NIP / NIS
                </label>
                <input
                  type="text"
                  value={idNumber}
                  onChange={(e) => setIdNumber(e.target.value)}
                  placeholder="Opsional"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-slate-900"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  No. Telepon
                </label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Opsional"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-slate-900"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={handleSwitchAccount}
                disabled={loading}
                className="px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium inline-flex items-center gap-1.5 cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                Ganti Akun
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 py-2.5 px-4 rounded-xl bg-[#2563eb] hover:bg-[#1d4ed8] disabled:opacity-60 text-white font-semibold text-sm transition-colors cursor-pointer"
              >
                {loading ? 'Menyimpan...' : 'Simpan & Masuk'}
              </button>
            </div>
          </form>
        ) : mode === 'register' ? (
          <form onSubmit={handlePasswordRegister} className="mt-5 space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nama Lengkap *
              </label>
              <input
                type="text"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Nama lengkap Anda"
                className="w-full px-3.5 py-2 rounded-xl bg-white border border-slate-300 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-slate-900"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nama pengguna *
                </label>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="cth. budi.guru"
                  className="w-full px-3.5 py-2 rounded-xl bg-white border border-slate-300 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-slate-900"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Peran Akun *
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as SystemRole)}
                  className="w-full px-3.5 py-2 rounded-xl bg-white border border-slate-300 text-sm text-slate-900 focus:outline-none focus:border-slate-900"
                >
                  {SELF_ROLE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Kelas / Unit *
                </label>
                <input
                  type="text"
                  required
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  placeholder="Lab / Kelas"
                  className="w-full px-3.5 py-2 rounded-xl bg-white border border-slate-300 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-slate-900"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Email (Opsional)
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nama@sekolah.sch.id"
                  className="w-full px-3.5 py-2 rounded-xl bg-white border border-slate-300 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-slate-900"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Kata sandi *
              </label>
              <div className="relative">
                <input
                  type={showRegPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  placeholder="Minimal 6 karakter"
                  className="w-full pl-3.5 pr-10 py-2 rounded-xl bg-white border border-slate-300 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-slate-900"
                />
                <button
                  type="button"
                  onClick={() => setShowRegPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-800 cursor-pointer"
                  aria-label={showRegPassword ? 'Sembunyikan kata sandi' : 'Lihat kata sandi'}
                >
                  {showRegPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 rounded-xl bg-[#2563eb] hover:bg-[#1d4ed8] disabled:opacity-60 text-white font-semibold text-sm transition-colors cursor-pointer"
            >
              {loading ? 'Mendaftar...' : 'Daftar & Masuk'}
            </button>

            <button
              type="button"
              onClick={() => {
                resetErrors();
                setMode('login');
              }}
              className="w-full py-2 text-xs font-medium text-slate-600 hover:text-slate-900 inline-flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Kembali ke halaman Masuk
            </button>
          </form>
        ) : (
          <>
            <form onSubmit={handlePasswordLogin} className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Nama pengguna
                </label>
                <input
                  type="text"
                  required
                  autoComplete="username"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="admin"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Kata sandi
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="•••••••"
                    className="w-full pl-3.5 pr-10 py-2.5 rounded-xl bg-white border border-slate-900 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/15"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-700 hover:text-slate-950 cursor-pointer"
                    aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Lihat kata sandi'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 rounded-xl bg-[#2563eb] hover:bg-[#1d4ed8] disabled:opacity-60 text-white font-semibold text-sm transition-colors cursor-pointer"
              >
                {loading ? 'Memproses...' : 'Masuk'}
              </button>
            </form>

            <div className="mt-5 rounded-xl bg-slate-50 border border-slate-200/80 p-3.5 text-xs text-slate-600">
              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <span>Belum punya akun pengguna?</span>
                <button
                  type="button"
                  onClick={() => {
                    resetErrors();
                    setMode('register');
                  }}
                  className="font-semibold text-[#2563eb] hover:text-[#1d4ed8] cursor-pointer"
                >
                  Daftar di sini
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
