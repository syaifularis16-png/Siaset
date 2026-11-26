import React, { useCallback, useEffect, useState } from 'react';
import {
  LayoutDashboard,
  Package,
  ClipboardList,
  CalendarClock,
  Wrench,
  UserCheck,
  Users,
  UserCog,
  LogOut,
  Monitor,
  Menu,
  X,
} from 'lucide-react';
import {
  ApiError,
  authApi,
  getStoredToken,
  setStoredToken,
  type AuthSessionResponse,
} from './lib/api';
import type { AppDataSnapshot, UserPrivateInfo, UserProfile } from './types';
import { AuthScreen } from './components/AuthScreen';
import { OverviewTab } from './components/OverviewTab';
import { AssetsTab } from './components/AssetsTab';
import { LoansTab } from './components/LoansTab';
import { SchedulesTab } from './components/SchedulesTab';
import { MaintenancesTab } from './components/MaintenancesTab';
import { AttendancesTab } from './components/AttendancesTab';
import { UsersTab } from './components/UsersTab';
import { ProfileTab } from './components/ProfileTab';

type TabKey =
  | 'overview'
  | 'assets'
  | 'loans'
  | 'schedules'
  | 'maintenances'
  | 'attendances'
  | 'users'
  | 'profile';

const EMPTY_SNAPSHOT: AppDataSnapshot = {
  assets: [],
  loans: [],
  schedules: [],
  maintenances: [],
  attendances: [],
  users: [],
};

export function App() {
  const [booting, setBooting] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(() => getStoredToken());
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [privateInfo, setPrivateInfo] = useState<UserPrivateInfo | null>(null);
  const [data, setData] = useState<AppDataSnapshot>(EMPTY_SNAPSHOT);
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const notify = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

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
      } catch {
        if (!cancelled) {
          setAuthNotice('Gagal menghubungi server SIPALAK.');
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

    let closedByEffect = false;
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

      ws.onopen = () => {
        ws?.send(JSON.stringify({ type: 'auth', token }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(String(event.data)) as { type?: string };
          if (msg.type === 'sync') {
            void refreshSnapshot().catch(() => {
              // Ignore transient refresh failure
            });
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
  }, [token, profile, refreshSnapshot, clearSession]);

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
      <div className="min-h-screen bg-slate-950 text-slate-200 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400 animate-pulse">
            <Monitor className="w-5 h-5" />
          </div>
          <p className="text-sm text-slate-400">Memuat SIPALAK...</p>
        </div>
      </div>
    );
  }

  if (!profile || !privateInfo) {
    return (
      <AuthScreen
        needsSetup={needsSetup}
        initialNotice={authNotice}
        onAuthenticated={handleAuthenticated}
      />
    );
  }

  const isAdmin = profile.role === 'admin';

  const navItems: { key: TabKey; label: string; icon: React.ComponentType<{ className?: string }>; adminOnly?: boolean }[] = [
    { key: 'overview', label: 'Beranda', icon: LayoutDashboard },
    { key: 'assets', label: 'Inventaris & QR', icon: Package },
    { key: 'loans', label: 'Peminjaman', icon: ClipboardList },
    { key: 'schedules', label: 'Jadwal Lab', icon: CalendarClock },
    { key: 'maintenances', label: 'Perawatan', icon: Wrench },
    { key: 'attendances', label: 'Absensi Lab', icon: UserCheck },
    { key: 'users', label: 'Pengguna', icon: Users, adminOnly: true },
    { key: 'profile', label: 'Profil Saya', icon: UserCog },
  ];

  const visibleNav = navItems.filter((item) => !item.adminOnly || isAdmin);

  const selectTab = (key: TabKey) => {
    setActiveTab(key);
    setMobileNavOpen(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col bg-slate-900 text-slate-100 border-r border-slate-800 shrink-0">
        <div className="px-5 py-5 border-b border-slate-800 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white">
            <Monitor className="w-5 h-5" />
          </div>
          <div>
            <div className="font-bold text-base leading-tight">SIPALAK</div>
            <div className="text-[11px] text-slate-400">SMKN 1 Sambeng</div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {visibleNav.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => selectTab(item.key)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer ${
                  active
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-800">
          <div className="mb-3 px-1">
            <div className="text-sm font-semibold text-white truncate">{profile.displayName}</div>
            <div className="text-xs text-slate-400 truncate">
              @{profile.username} • <span className="capitalize">{profile.role}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            Keluar
          </button>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/60"
            onClick={() => setMobileNavOpen(false)}
          />
          <aside className="relative w-64 max-w-[80vw] bg-slate-900 text-slate-100 flex flex-col z-10">
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
              <span className="font-bold">SIPALAK</span>
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 p-3 space-y-1">
              {visibleNav.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => selectTab(item.key)}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium ${
                      active ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {item.label}
                  </button>
                );
              })}
            </nav>
            <div className="p-4 border-t border-slate-800">
              <button
                type="button"
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-slate-800 text-slate-200 text-xs font-semibold"
              >
                <LogOut className="w-4 h-4" />
                Keluar
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="lg:hidden bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between sticky top-0 z-30">
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            className="p-2 rounded-lg text-slate-600 hover:bg-slate-100"
          >
            <Menu className="w-5 h-5" />
          </button>
          <span className="font-bold text-slate-900">SIPALAK</span>
          <span className="text-xs font-medium text-slate-500 capitalize">{profile.role}</span>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {activeTab === 'overview' && (
            <OverviewTab data={data} profile={profile} onNavigate={selectTab} />
          )}
          {activeTab === 'assets' && (
            <AssetsTab
              assets={data.assets}
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
      </div>

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
