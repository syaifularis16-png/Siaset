import React, { useCallback, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import {
  LayoutGrid,
  Monitor,
  ArrowLeftRight,
  CalendarDays,
  Wrench,
  User,
  Check,
  FileText,
  UserCog,
  Menu,
  X,
  GraduationCap,
  Shield,
  Pencil,
  ScanBarcode,
} from 'lucide-react';
import { authApi, formatApiError } from './lib/api';
import { auth } from './lib/firebase';
import {
  resolveFirebaseSession,
  subscribeFirestoreBranding,
  subscribeFirestoreSnapshot,
} from './lib/firebaseBackend';
import {
  DEFAULT_BRANDING,
  type AppDataSnapshot,
  type BrandingSettings,
  type UserPrivateInfo,
  type UserProfile,
} from './types';
import { AuthScreen } from './components/AuthScreen';
import { OverviewTab } from './components/OverviewTab';
import { AssetsTab } from './components/AssetsTab';
import { LoansTab } from './components/LoansTab';
import { SchedulesTab } from './components/SchedulesTab';
import { MaintenancesTab } from './components/MaintenancesTab';
import { AttendancesTab } from './components/AttendancesTab';
import { UsersTab } from './components/UsersTab';
import { ReportsTab } from './components/ReportsTab';
import { ProfileTab } from './components/ProfileTab';
import { BrandingModal } from './components/BrandingModal';
import { ReturnsTab } from './components/ReturnsTab';

type TabKey =
  | 'overview'
  | 'assets'
  | 'loans'
  | 'returns'
  | 'schedules'
  | 'maintenances'
  | 'users'
  | 'attendances'
  | 'reports'
  | 'profile';

const EMPTY_SNAPSHOT: AppDataSnapshot = {
  assets: [],
  loans: [],
  schedules: [],
  maintenances: [],
  attendances: [],
  users: [],
  invites: [],
};

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  teknisi: 'Teknisi',
  guru: 'Guru',
  siswa: 'Siswa',
  pengguna: 'Pengguna',
};

function formatIndonesianDate(date: Date): string {
  try {
    return new Intl.DateTimeFormat('id-ID', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(date);
  } catch {
    return date.toLocaleDateString('id-ID');
  }
}

export function App() {
  const [booting, setBooting] = useState(true);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [onboardingUser, setOnboardingUser] = useState<{
    email: string;
    displayName: string;
  } | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [privateInfo, setPrivateInfo] = useState<UserPrivateInfo | null>(null);
  const [data, setData] = useState<AppDataSnapshot>(EMPTY_SNAPSHOT);
  const [branding, setBranding] = useState<BrandingSettings>(DEFAULT_BRANDING);
  const [brandingModalOpen, setBrandingModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const profileUidRef = useRef<string | null>(null);
  profileUidRef.current = profile?.uid ?? null;

  useEffect(() => {
    document.title = `${branding.appName} — ${branding.appSubtitle}`;
  }, [branding]);

  const notify = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  // Real-time branding listener
  useEffect(() => {
    const unsub = subscribeFirestoreBranding(setBranding);
    return () => unsub();
  }, []);

  // Auth state observer
  useEffect(() => {
    let cancelled = false;
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        if (!cancelled) {
          setProfile(null);
          setPrivateInfo(null);
          setOnboardingUser(null);
          setData(EMPTY_SNAPSHOT);
          setBooting(false);
        }
        return;
      }

      if (profileUidRef.current === firebaseUser.uid) {
        if (!cancelled) setBooting(false);
        return;
      }

      try {
        const res = await resolveFirebaseSession(firebaseUser);
        if (cancelled) return;
        if (res.status === 'ready') {
          setProfile(res.profile);
          setPrivateInfo(res.privateInfo);
          setOnboardingUser(null);
          setAuthNotice(null);
          setActiveTab((prev) => {
            if (res.profile.role === 'guru' || res.profile.role === 'siswa') {
              return prev === 'loans' || prev === 'returns' ? prev : 'assets';
            }
            return prev;
          });
        } else {
          setProfile(null);
          setPrivateInfo(null);
          setOnboardingUser({ email: res.email, displayName: res.displayName });
        }
      } catch (err) {
        if (!cancelled) {
          setProfile(null);
          setPrivateInfo(null);
          setOnboardingUser(null);
          setAuthNotice(formatApiError(err, 'Gagal memverifikasi sesi pengguna.'));
        }
      } finally {
        if (!cancelled) setBooting(false);
      }
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  // Real-time Firestore data listeners (only when authenticated and profile ready)
  const profileUid = profile?.uid ?? null;
  const isAdmin = profile?.role === 'admin';

  useEffect(() => {
    if (!profileUid) return;
    const unsub = subscribeFirestoreSnapshot(
      profileUid,
      isAdmin,
      (updater) => setData(updater),
      (err) => {
        notify(formatApiError(err, 'Gagal menyinkronkan data Cloud Firestore.'), 'error');
      }
    );
    return () => unsub();
  }, [profileUid, isAdmin, notify]);

  const refreshSnapshot = useCallback(async () => {
    if (!profileUid) return;
    const snapshot = await authApi.fetchSnapshot(isAdmin);
    setData(snapshot);
  }, [profileUid, isAdmin]);

  const handleLogout = async () => {
    setProfile(null);
    setPrivateInfo(null);
    setOnboardingUser(null);
    setData(EMPTY_SNAPSHOT);
    await Promise.resolve();
    try {
      await authApi.logout();
    } catch {
      // Ignore transient signOut errors
    }
  };

  if (booting) {
    return (
      <div className="min-h-screen sipalak-auth-bg text-slate-200 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center text-white animate-pulse">
            <Monitor className="w-5 h-5" />
          </div>
          <p className="text-sm text-slate-300">Memuat SIPALAK...</p>
        </div>
      </div>
    );
  }

  if (!profile || !privateInfo) {
    return (
      <AuthScreen
        branding={branding}
        initialNotice={authNotice}
        onboardingUser={onboardingUser}
        onAuthenticated={(nextProfile, nextPrivate) => {
          profileUidRef.current = nextProfile.uid;
          setProfile(nextProfile);
          setPrivateInfo(nextPrivate);
          setOnboardingUser(null);
          setAuthNotice(null);
          setActiveTab(
            nextProfile.role === 'guru' || nextProfile.role === 'siswa' ? 'assets' : 'overview'
          );
        }}
        onCancelOnboarding={() => {
          setOnboardingUser(null);
          setAuthNotice(null);
        }}
      />
    );
  }

  const isGuruOrSiswa = profile.role === 'guru' || profile.role === 'siswa';

  type NavItem = {
    key: TabKey;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    adminOnly?: boolean;
    count?: number;
  };

  const pendingLoansCount = data.loans.filter((l) => l.status === 'Menunggu').length;
  const returnableLoansCount = data.loans.filter(
    (l) =>
      (l.status === 'Dipinjam' || l.status === 'Disetujui') &&
      (isAdmin || l.requesterId === profile.uid)
  ).length;
  const pendingSchedulesCount = data.schedules.filter((s) => s.status === 'Menunggu').length;
  const openMaintenanceCount = data.maintenances.filter((m) => m.status !== 'Selesai').length;
  const activeAttendanceCount = data.attendances.filter((a) => !a.checkOutTime).length;

  const navGroups: { title: string; items: NavItem[] }[] = isGuruOrSiswa
    ? [
        {
          title: 'MANAJEMEN LAB',
          items: [
            { key: 'assets', label: 'Inventaris', icon: Monitor },
            { key: 'loans', label: 'Peminjaman', icon: ArrowLeftRight },
            {
              key: 'returns',
              label: 'Pengembalian',
              icon: ScanBarcode,
              count: returnableLoansCount > 0 ? returnableLoansCount : undefined,
            },
          ],
        },
      ]
    : [
        {
          title: 'RINGKASAN',
          items: [{ key: 'overview', label: 'Dashboard', icon: LayoutGrid }],
        },
        {
          title: 'MANAJEMEN LAB',
          items: [
            { key: 'assets', label: 'Inventaris', icon: Monitor },
            {
              key: 'loans',
              label: 'Peminjaman',
              icon: ArrowLeftRight,
              count: pendingLoansCount > 0 ? pendingLoansCount : undefined,
            },
            {
              key: 'returns',
              label: 'Pengembalian',
              icon: ScanBarcode,
              count: returnableLoansCount > 0 ? returnableLoansCount : undefined,
            },
            {
              key: 'schedules',
              label: 'Jadwal Lab',
              icon: CalendarDays,
              count: pendingSchedulesCount > 0 ? pendingSchedulesCount : undefined,
            },
            {
              key: 'maintenances',
              label: 'Maintenance',
              icon: Wrench,
              count: openMaintenanceCount > 0 ? openMaintenanceCount : undefined,
            },
            { key: 'users', label: 'Pengguna', icon: User, adminOnly: true },
          ],
        },
        {
          title: 'ADMINISTRASI',
          items: [
            {
              key: 'attendances',
              label: 'Absensi',
              icon: Check,
              count: activeAttendanceCount > 0 ? activeAttendanceCount : undefined,
            },
            { key: 'reports', label: 'Laporan', icon: FileText },
            { key: 'profile', label: 'Profil Saya', icon: UserCog },
          ],
        },
      ];

  const effectiveTab: TabKey =
    isGuruOrSiswa && activeTab !== 'assets' && activeTab !== 'loans' && activeTab !== 'returns'
      ? 'assets'
      : activeTab;

  const allItems = navGroups.flatMap((g) => g.items);
  const currentTitle = allItems.find((i) => i.key === effectiveTab)?.label ?? 'Inventaris';

  const selectTab = (key: TabKey) => {
    if (isGuruOrSiswa && key !== 'assets' && key !== 'loans' && key !== 'returns') {
      setActiveTab('assets');
    } else {
      setActiveTab(key);
    }
    setMobileNavOpen(false);
  };

  const formattedDate = formatIndonesianDate(new Date());
  const roleLabel = ROLE_LABELS[profile.role] ?? profile.role;

  const renderSidebarBody = (onClose?: () => void) => (
    <div className="flex flex-col h-full sipalak-sidebar-bg text-slate-200">
      <div className="px-5 pt-5 pb-4 border-b border-white/10">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            {branding.logoDataUrl ? (
              <div className="flex items-start gap-3">
                <img
                  src={branding.logoDataUrl}
                  alt={branding.appName}
                  className="w-12 h-12 rounded-xl object-contain bg-white/95 p-1 shadow-sm shrink-0 mt-0.5"
                />
                <div className="min-w-0">
                  <div className="text-lg font-extrabold italic tracking-tight text-white leading-tight">
                    {branding.appName}
                  </div>
                  <p className="text-[11px] text-slate-300 mt-1 leading-snug">
                    {branding.appSubtitle}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                    {branding.schoolName}
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-emerald-300">
                    <Shield className="w-4 h-4" />
                  </div>
                  <div className="w-8 h-8 rounded-lg bg-sky-500/20 border border-sky-400/30 flex items-center justify-center text-sky-300">
                    <GraduationCap className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-xl font-extrabold italic tracking-tight text-white leading-none">
                  {branding.appName}
                </div>
                <p className="text-[11px] text-slate-300 mt-1.5 leading-snug">
                  {branding.appSubtitle}
                </p>
                <p className="text-[11px] text-slate-400 leading-snug">{branding.schoolName}</p>
              </>
            )}
            {isAdmin && (
              <button
                type="button"
                onClick={() => setBrandingModalOpen(true)}
                className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/15 text-[11px] font-medium text-slate-200 transition-colors cursor-pointer"
                title="Ubah nama aplikasi, layanan, dan nama sekolah"
              >
                <Pencil className="w-3 h-3" />
                Ubah Identitas
              </button>
            )}
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white lg:hidden cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {navGroups.map((group) => {
          const items = group.items.filter((item) => !item.adminOnly || isAdmin);
          if (items.length === 0) return null;
          return (
            <div key={group.title}>
              <div className="px-3 mb-2 text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
                {group.title}
              </div>
              <div className="space-y-1">
                {items.map((item) => {
                  const Icon = item.icon;
                  const active = effectiveTab === item.key;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => selectTab(item.key)}
                      className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
                        active
                          ? 'bg-[#273d5c] text-white'
                          : 'text-slate-300 hover:bg-white/5 hover:text-white'
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0 opacity-85" />
                      <span className="flex-1 text-left">{item.label}</span>
                      {item.count !== undefined && (
                        <span className="text-[11px] font-mono tabular-nums text-amber-300">
                          {item.count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>
    </div>
  );

  return (
    <div className="min-h-screen sipalak-app-bg text-slate-900 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block lg:w-[250px] shrink-0 border-r border-slate-800/40">
        <div className="sticky top-0 h-screen">{renderSidebarBody()}</div>
      </aside>

      {/* Mobile Drawer */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/60"
            onClick={() => setMobileNavOpen(false)}
          />
          <aside className="relative w-64 max-w-[82vw] z-10 h-full">
            {renderSidebarBody(() => setMobileNavOpen(false))}
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-white/85 backdrop-blur-md border-b border-slate-200/80 px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between gap-4 sticky top-0 z-30">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="lg:hidden p-2 rounded-lg text-slate-600 hover:bg-slate-100 cursor-pointer"
              aria-label="Buka navigasi"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <div className="text-xs text-slate-500 truncate">
                Sistem Informasi / {currentTitle}
              </div>
              <h1 className="text-base sm:text-lg font-bold text-slate-900 leading-tight truncate">
                {currentTitle}
              </h1>
            </div>
          </div>

          <div className="flex flex-col items-end text-right shrink-0">
            <div className="hidden sm:block text-xs text-slate-500">
              <span className="font-medium text-slate-700">
                {profile.unit || 'Lab Komputer Akuntansi'}
              </span>
              <span className="mx-1.5 text-slate-300">·</span>
              <span>{formattedDate}</span>
            </div>
            <div className="flex items-center gap-2.5 mt-0.5">
              {isGuruOrSiswa ? (
                <span className="text-xs text-slate-600 truncate max-w-[180px] sm:max-w-none">
                  {profile.displayName} · {roleLabel}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => selectTab('profile')}
                  className="text-xs text-slate-600 hover:text-slate-900 transition-colors cursor-pointer truncate max-w-[180px] sm:max-w-none"
                  title="Buka Profil Saya"
                >
                  {profile.displayName} · {roleLabel}
                </button>
              )}
              <button
                type="button"
                onClick={handleLogout}
                className="px-3 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
              >
                Keluar
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1200px] w-full mx-auto">
          {effectiveTab === 'overview' && (
            <OverviewTab
              data={data}
              profile={profile}
              branding={branding}
              onNavigate={selectTab}
            />
          )}
          {effectiveTab === 'assets' && (
            <AssetsTab
              assets={data.assets}
              loans={data.loans}
              maintenances={data.maintenances}
              branding={branding}
              isAdmin={isAdmin}
              onRefresh={refreshSnapshot}
              onNotify={notify}
            />
          )}
          {effectiveTab === 'loans' && (
            <LoansTab
              loans={data.loans}
              assets={data.assets}
              profile={profile}
              branding={branding}
              isAdmin={isAdmin}
              onRefresh={refreshSnapshot}
              onNotify={notify}
            />
          )}
          {effectiveTab === 'returns' && (
            <ReturnsTab
              loans={data.loans}
              assets={data.assets}
              profile={profile}
              isAdmin={isAdmin}
              onRefresh={refreshSnapshot}
              onNotify={notify}
            />
          )}
          {effectiveTab === 'schedules' && (
            <SchedulesTab
              schedules={data.schedules}
              profile={profile}
              isAdmin={isAdmin}
              onRefresh={refreshSnapshot}
              onNotify={notify}
            />
          )}
          {effectiveTab === 'maintenances' && (
            <MaintenancesTab
              maintenances={data.maintenances}
              assets={data.assets}
              profile={profile}
              isAdmin={isAdmin}
              onRefresh={refreshSnapshot}
              onNotify={notify}
            />
          )}
          {effectiveTab === 'attendances' && (
            <AttendancesTab
              attendances={data.attendances}
              profile={profile}
              isAdmin={isAdmin}
              onRefresh={refreshSnapshot}
              onNotify={notify}
            />
          )}
          {effectiveTab === 'users' && isAdmin && (
            <UsersTab
              users={data.users}
              invites={data.invites}
              currentUserId={profile.uid}
              onRefresh={refreshSnapshot}
              onNotify={notify}
            />
          )}
          {effectiveTab === 'reports' && <ReportsTab data={data} branding={branding} />}
          {effectiveTab === 'profile' && (
            <ProfileTab
              profile={profile}
              privateInfo={privateInfo}
              onProfileUpdated={(nextProfile, nextPrivate) => {
                setProfile(nextProfile);
                setPrivateInfo(nextPrivate);
                void refreshSnapshot();
              }}
              onNotify={notify}
            />
          )}
        </main>

        <footer className="py-4 px-6 text-center text-xs text-slate-400">
          {branding.appName} · {branding.appSubtitle} · Tersimpan permanen di Cloud Firestore
        </footer>
      </div>

      <BrandingModal
        open={brandingModalOpen}
        branding={branding}
        onClose={() => setBrandingModalOpen(false)}
        onSaved={setBranding}
        onNotify={notify}
      />

      {toast && (
        <div className="fixed bottom-5 right-5 z-50">
          <div
            className={`px-4 py-3 rounded-xl shadow-lg text-sm font-medium border ${
              toast.type === 'error'
                ? 'bg-rose-600 text-white border-rose-500'
                : 'bg-slate-900 text-white border-slate-800'
            }`}
          >
            {toast.message}
          </div>
        </div>
      )}
    </div>
  );
}
