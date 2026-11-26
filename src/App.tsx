import React, { useCallback, useEffect, useState } from 'react';
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
} from 'lucide-react';
import {
  ApiError,
  authApi,
  brandingApi,
  getBackendMode,
  getStoredToken,
  getWsUrl,
  probeBackend,
  setStoredToken,
  type AuthSessionResponse,
} from './lib/api';
import { subscribeLocalSync } from './lib/localBackend';
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

type TabKey =
  | 'overview'
  | 'assets'
  | 'loans'
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
  const [needsSetup, setNeedsSetup] = useState(false);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(() => getStoredToken());
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [privateInfo, setPrivateInfo] = useState<UserPrivateInfo | null>(null);
  const [data, setData] = useState<AppDataSnapshot>(EMPTY_SNAPSHOT);
  const [branding, setBranding] = useState<BrandingSettings>(DEFAULT_BRANDING);
  const [brandingModalOpen, setBrandingModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

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

  const refreshBranding = useCallback(async () => {
    try {
      const next = await brandingApi.get();
      setBranding(next);
    } catch {
      // Keep current branding on transient failure
    }
  }, []);

  const refreshSnapshot = useCallback(async () => {
    const snapshot = await authApi.fetchSnapshot();
    setData(snapshot);
  }, []);

  const clearSession = useCallback((notice?: string) => {
    setStoredToken(null);
    setToken(null);
    setProfile(null);
    setPrivateInfo(null);
    setData(EMPTY_SNAPSHOT);
    if (notice) setAuthNotice(notice);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      setBooting(true);
      await probeBackend(true);
      void refreshBranding();
      const existingToken = getStoredToken();
      if (existingToken) {
        try {
          const [me, snapshot] = await Promise.all([authApi.me(), authApi.fetchSnapshot()]);
          if (!cancelled) {
            setProfile(me.profile);
            setPrivateInfo(me.privateInfo);
            setData(snapshot);
            setToken(existingToken);
            setNeedsSetup(false);
            setBooting(false);
          }
          return;
        } catch (err) {
          if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
            setStoredToken(null);
          }
        }
      }

      try {
        const status = await authApi.bootstrapStatus();
        if (!cancelled) {
          setNeedsSetup(status.needsSetup);
          setProfile(null);
          setToken(null);
        }
      } catch (err) {
        if (!cancelled) {
          setAuthNotice(
            err instanceof Error ? err.message : 'Gagal menghubungi server SIPALAK.'
          );
        }
      } finally {
        if (!cancelled) setBooting(false);
      }
    }

    void init();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!token || !profile) return;

    if (getBackendMode() === 'local') {
      return subscribeLocalSync(() => {
        void refreshBranding();
        void refreshSnapshot().catch(() => {
          // Ignore transient refresh failure
        });
      });
    }

    let closedByEffect = false;
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      ws = new WebSocket(getWsUrl());

      ws.onopen = () => {
        ws?.send(JSON.stringify({ type: 'auth', token }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(String(event.data)) as { type?: string; scope?: string };
          if (msg.type === 'sync') {
            if (msg.scope === 'branding') {
              void refreshBranding();
            } else {
              void refreshSnapshot().catch(() => {
                // Ignore transient refresh failure
              });
            }
          } else if (msg.type === 'force-logout') {
            clearSession('Sesi Anda telah dinonaktifkan oleh Administrator.');
          }
        } catch {
          // Ignore malformed message
        }
      };

      ws.onclose = () => {
        if (!closedByEffect) {
          reconnectTimer = setTimeout(connect, 3000);
        }
      };
    };

    connect();

    return () => {
      closedByEffect = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, [token, profile, refreshBranding, refreshSnapshot, clearSession]);

  const handleAuthenticated = async (res: AuthSessionResponse) => {
    setStoredToken(res.token);
    setToken(res.token);
    setProfile(res.profile);
    setPrivateInfo(res.privateInfo);
    setNeedsSetup(false);
    setAuthNotice(null);
    setActiveTab('overview');
    try {
      await refreshSnapshot();
    } catch {
      // Snapshot will retry if needed
    }
  };

  const handleLogout = async () => {
    try {
      await authApi.logout();
    } catch {
      // Ignore network errors during logout
    }
    clearSession();
  };

  if (booting) {
    return (
      <div className="min-h-screen bg-[#0f213a] text-slate-200 flex items-center justify-center">
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
        needsSetup={needsSetup}
        branding={branding}
        initialNotice={authNotice}
        onAuthenticated={handleAuthenticated}
      />
    );
  }

  const isAdmin = profile.role === 'admin';

  type NavItem = {
    key: TabKey;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    adminOnly?: boolean;
  };

  const navGroups: { title: string; items: NavItem[] }[] = [
    {
      title: 'RINGKASAN',
      items: [{ key: 'overview', label: 'Dashboard', icon: LayoutGrid }],
    },
    {
      title: 'MANAJEMEN LAB',
      items: [
        { key: 'assets', label: 'Inventaris', icon: Monitor },
        { key: 'loans', label: 'Peminjaman', icon: ArrowLeftRight },
        { key: 'schedules', label: 'Jadwal Lab', icon: CalendarDays },
        { key: 'maintenances', label: 'Maintenance', icon: Wrench },
        { key: 'users', label: 'Pengguna', icon: User, adminOnly: true },
      ],
    },
    {
      title: 'ADMINISTRASI',
      items: [
        { key: 'attendances', label: 'Absensi', icon: Check },
        { key: 'reports', label: 'Laporan', icon: FileText },
        { key: 'profile', label: 'Profil Saya', icon: UserCog },
      ],
    },
  ];

  const allItems = navGroups.flatMap((g) => g.items);
  const currentTitle = allItems.find((i) => i.key === activeTab)?.label ?? 'Dashboard';

  const selectTab = (key: TabKey) => {
    setActiveTab(key);
    setMobileNavOpen(false);
  };

  const formattedDate = formatIndonesianDate(new Date());
  const roleLabel = ROLE_LABELS[profile.role] ?? profile.role;

  const renderSidebarBody = (onClose?: () => void) => (
    <div className="flex flex-col h-full bg-[#0f213a] text-slate-200">
      <div className="px-5 pt-5 pb-4 border-b border-white/10">
        <div className="flex items-start justify-between gap-2">
          <div>
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
            {isAdmin && (
              <button
                type="button"
                onClick={() => setBrandingModalOpen(true)}
                className="mt-2.5 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/15 text-[11px] font-medium text-slate-200 transition-colors cursor-pointer"
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
                  const active = activeTab === item.key;
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
                      <span>{item.label}</span>
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
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 flex">
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
        <header className="bg-white border-b border-slate-200/80 px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between gap-4 sticky top-0 z-30">
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
              <button
                type="button"
                onClick={() => selectTab('profile')}
                className="text-xs text-slate-600 hover:text-slate-900 transition-colors cursor-pointer truncate max-w-[180px] sm:max-w-none"
                title="Buka Profil Saya"
              >
                {profile.displayName} · {roleLabel}
              </button>
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
          {activeTab === 'overview' && (
            <OverviewTab data={data} profile={profile} onNavigate={selectTab} />
          )}
          {activeTab === 'assets' && (
            <AssetsTab
              assets={data.assets}
              branding={branding}
              isAdmin={isAdmin}
              onRefresh={refreshSnapshot}
              onNotify={notify}
            />
          )}
          {activeTab === 'loans' && (
            <LoansTab
              loans={data.loans}
              assets={data.assets}
              profile={profile}
              isAdmin={isAdmin}
              onRefresh={refreshSnapshot}
              onNotify={notify}
            />
          )}
          {activeTab === 'schedules' && (
            <SchedulesTab
              schedules={data.schedules}
              profile={profile}
              isAdmin={isAdmin}
              onRefresh={refreshSnapshot}
              onNotify={notify}
            />
          )}
          {activeTab === 'maintenances' && (
            <MaintenancesTab
              maintenances={data.maintenances}
              assets={data.assets}
              profile={profile}
              isAdmin={isAdmin}
              onRefresh={refreshSnapshot}
              onNotify={notify}
            />
          )}
          {activeTab === 'attendances' && (
            <AttendancesTab
              attendances={data.attendances}
              profile={profile}
              isAdmin={isAdmin}
              onRefresh={refreshSnapshot}
              onNotify={notify}
            />
          )}
          {activeTab === 'users' && isAdmin && (
            <UsersTab
              users={data.users}
              currentUserId={profile.uid}
              onRefresh={refreshSnapshot}
              onNotify={notify}
            />
          )}
          {activeTab === 'reports' && <ReportsTab data={data} />}
          {activeTab === 'profile' && (
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
          {branding.appName} · {branding.appSubtitle} ·{' '}
          {getBackendMode() === 'local'
            ? 'Data tersimpan pada browser perangkat ini'
            : 'Sinkronisasi server aktif'}
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

export default App;
