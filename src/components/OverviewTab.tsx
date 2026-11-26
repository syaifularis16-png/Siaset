import React, { useMemo } from 'react';
import {
  Package,
  ClipboardList,
  CalendarClock,
  Wrench,
  UserCheck,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  Clock,
  Activity,
} from 'lucide-react';
import {
  ASSET_CATEGORIES,
  todayIsoDate,
  toLocalIsoDate,
  type AppDataSnapshot,
  type BrandingSettings,
  type UserProfile,
} from '../types';

interface OverviewTabProps {
  data: AppDataSnapshot;
  profile: UserProfile;
  branding?: BrandingSettings;
  onNavigate: (
    tab: 'assets' | 'loans' | 'schedules' | 'maintenances' | 'attendances' | 'reports'
  ) => void;
}

function getLast7Days(): { date: string; shortLabel: string }[] {
  const days: { date: string; shortLabel: string }[] = [];
  const fmt = new Intl.DateTimeFormat('id-ID', { weekday: 'short', day: 'numeric' });
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push({
      date: toLocalIsoDate(d),
      shortLabel: fmt.format(d),
    });
  }
  return days;
}

export const OverviewTab: React.FC<OverviewTabProps> = ({
  data,
  profile,
  branding,
  onNavigate,
}) => {
  const today = todayIsoDate();

  const metrics = useMemo(() => {
    const totalAssets = data.assets.length;
    const goodAssets = data.assets.filter((a) => a.condition === 'Baik').length;
    const careAssets = data.assets.filter((a) => a.condition === 'Perlu perawatan').length;
    const brokenAssets = data.assets.filter((a) => a.condition === 'Rusak').length;

    const borrowedAssetIds = new Set(
      data.loans.filter((l) => l.status === 'Dipinjam').map((l) => l.assetId)
    );
    const currentlyBorrowed = borrowedAssetIds.size;
    const readyAssets = Math.max(0, goodAssets - currentlyBorrowed);

    const waitingLoans = data.loans.filter((l) => l.status === 'Menunggu');
    const activeLoans = data.loans.filter(
      (l) => l.status === 'Menunggu' || l.status === 'Disetujui' || l.status === 'Dipinjam'
    );
    const overdueLoans = data.loans.filter(
      (l) => l.status === 'Dipinjam' && l.returnDate && l.returnDate < today
    );

    const waitingSchedules = data.schedules.filter((s) => s.status === 'Menunggu');
    const todaySchedules = data.schedules
      .filter((s) => s.date === today && s.status !== 'Ditolak')
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
    const activeSchedules = data.schedules.filter(
      (s) => s.status === 'Menunggu' || s.status === 'Disetujui'
    );

    const openMaintenances = data.maintenances.filter((m) => m.status !== 'Selesai');
    const dueMaintenanceAssets = data.assets.filter(
      (a) =>
        a.condition !== 'Baik' ||
        (a.nextMaintenanceDate && a.nextMaintenanceDate <= today)
    );

    const activeVisitors = data.attendances.filter((a) => !a.checkOutTime);
    const todayVisitors = data.attendances.filter((a) => a.date === today);

    const categoryStats = ASSET_CATEGORIES.map((cat) => {
      const items = data.assets.filter((a) => a.category === cat);
      const borrowed = items.filter((a) => borrowedAssetIds.has(a.id)).length;
      const issue = items.filter((a) => a.condition !== 'Baik').length;
      return {
        category: cat,
        total: items.length,
        borrowed,
        issue,
      };
    }).filter((c) => c.total > 0);

    const last7 = getLast7Days().map((d) => {
      const loansCount = data.loans.filter((l) => l.borrowDate === d.date).length;
      const attCount = data.attendances.filter((a) => a.date === d.date).length;
      const schCount = data.schedules.filter((s) => s.date === d.date).length;
      return {
        ...d,
        loansCount,
        attCount,
        schCount,
        total: loansCount + attCount + schCount,
      };
    });
    const maxActivity = Math.max(1, ...last7.map((x) => x.total));

    const loanByStatus = [
      { label: 'Menunggu', count: waitingLoans.length, barClass: 'bg-amber-500' },
      {
        label: 'Disetujui',
        count: data.loans.filter((l) => l.status === 'Disetujui').length,
        barClass: 'bg-sky-500',
      },
      {
        label: 'Dipinjam',
        count: data.loans.filter((l) => l.status === 'Dipinjam').length,
        barClass: 'bg-indigo-600',
      },
      {
        label: 'Dikembalikan',
        count: data.loans.filter((l) => l.status === 'Dikembalikan').length,
        barClass: 'bg-emerald-500',
      },
      {
        label: 'Ditolak',
        count: data.loans.filter((l) => l.status === 'Ditolak').length,
        barClass: 'bg-rose-500',
      },
    ];

    return {
      totalAssets,
      goodAssets,
      careAssets,
      brokenAssets,
      currentlyBorrowed,
      readyAssets,
      waitingLoans,
      activeLoans,
      overdueLoans,
      waitingSchedules,
      todaySchedules,
      activeSchedules,
      openMaintenances,
      dueMaintenanceAssets,
      activeVisitors,
      todayVisitors,
      categoryStats,
      last7,
      maxActivity,
      loanByStatus,
    };
  }, [data, today]);

  const stats = [
    {
      label: 'Total Inventaris',
      value: metrics.totalAssets,
      sub: `${metrics.readyAssets} siap pakai · ${metrics.currentlyBorrowed} dipinjam`,
      icon: Package,
      color: 'bg-indigo-50 text-indigo-600 border-indigo-100',
      tab: 'assets' as const,
    },
    {
      label: 'Peminjaman Aktif',
      value: metrics.activeLoans.length,
      sub:
        metrics.overdueLoans.length > 0
          ? `${metrics.waitingLoans.length} menunggu · ${metrics.overdueLoans.length} terlambat`
          : `${metrics.waitingLoans.length} menunggu persetujuan`,
      icon: ClipboardList,
      color: 'bg-amber-50 text-amber-600 border-amber-100',
      tab: 'loans' as const,
    },
    {
      label: 'Jadwal Lab',
      value: metrics.activeSchedules.length,
      sub: `${metrics.todaySchedules.length} agenda hari ini · ${metrics.waitingSchedules.length} menunggu`,
      icon: CalendarClock,
      color: 'bg-emerald-50 text-emerald-600 border-emerald-100',
      tab: 'schedules' as const,
    },
    {
      label: 'Perawatan & Kondisi',
      value: metrics.openMaintenances.length,
      sub: `${metrics.dueMaintenanceAssets.length} aset perlu perhatian / servis`,
      icon: Wrench,
      color: 'bg-rose-50 text-rose-600 border-rose-100',
      tab: 'maintenances' as const,
    },
  ];

  const alerts: Array<{
    id: string;
    title: string;
    detail: string;
    tone: 'danger' | 'warn' | 'info';
    tab: 'loans' | 'schedules' | 'maintenances' | 'assets';
  }> = [];

  if (metrics.overdueLoans.length > 0) {
    alerts.push({
      id: 'overdue-loans',
      title: `${metrics.overdueLoans.length} peminjaman melewati batas tanggal kembali`,
      detail: metrics.overdueLoans
        .slice(0, 2)
        .map((l) => `${l.assetName} (${l.borrowerName})`)
        .join(', '),
      tone: 'danger',
      tab: 'loans',
    });
  }
  if (metrics.waitingLoans.length > 0) {
    alerts.push({
      id: 'waiting-loans',
      title: `${metrics.waitingLoans.length} pengajuan peminjaman menunggu persetujuan`,
      detail: 'Tinjau, setujui, atau beri catatan penolakan pada modul Peminjaman.',
      tone: 'warn',
      tab: 'loans',
    });
  }
  if (metrics.waitingSchedules.length > 0) {
    alerts.push({
      id: 'waiting-schedules',
      title: `${metrics.waitingSchedules.length} pengajuan jadwal lab belum dikonfirmasi`,
      detail: 'Periksa potensi bentrok jam praktik di modul Jadwal Lab.',
      tone: 'info',
      tab: 'schedules',
    });
  }
  if (metrics.dueMaintenanceAssets.length > 0) {
    alerts.push({
      id: 'due-maint',
      title: `${metrics.dueMaintenanceAssets.length} aset membutuhkan perawatan atau jatuh tempo servis`,
      detail: `${metrics.brokenAssets} rusak · ${metrics.careAssets} perlu perawatan`,
      tone: 'warn',
      tab: 'maintenances',
    });
  }

  const goodPct =
    metrics.totalAssets > 0 ? Math.round((metrics.goodAssets / metrics.totalAssets) * 100) : 0;
  const carePct =
    metrics.totalAssets > 0 ? Math.round((metrics.careAssets / metrics.totalAssets) * 100) : 0;
  const brokenPct = Math.max(0, 100 - goodPct - carePct);

  return (
    <div className="space-y-6">
      {/* Header Summary Banner */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-slate-900">
            Selamat datang, {profile.displayName}
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">
            {profile.unit || branding?.schoolName || 'Laboratorium Komputer'} · Peran:{' '}
            <span className="font-medium capitalize text-slate-700">{profile.role}</span> ·{' '}
            <span>{metrics.todayVisitors.length} kunjungan hari ini</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onNavigate('attendances')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold cursor-pointer whitespace-nowrap"
          >
            <UserCheck className="w-4 h-4" />
            Absensi ({metrics.activeVisitors.length} di lab)
          </button>
          <button
            type="button"
            onClick={() => onNavigate('loans')}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-sm font-semibold cursor-pointer whitespace-nowrap"
          >
            Kelola Peminjaman
          </button>
          <button
            type="button"
            onClick={() => onNavigate('reports')}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium cursor-pointer whitespace-nowrap"
          >
            Laporan Resmi
          </button>
        </div>
      </div>

      {/* 4 KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.label}
              type="button"
              onClick={() => onNavigate(item.tab)}
              className="text-left bg-white rounded-2xl border border-slate-200 p-5 hover:border-blue-300 hover:shadow-sm transition-all cursor-pointer"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  {item.label}
                </span>
                <div className={`p-2 rounded-xl border ${item.color}`}>
                  <Icon className="w-4 h-4" />
                </div>
              </div>
              <div className="text-3xl font-bold text-slate-900 font-mono tabular-nums">
                {item.value}
              </div>
              <p className="text-xs text-slate-500 mt-1">{item.sub}</p>
            </button>
          );
        })}
      </div>

      {/* Action / Alert Center */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <h3 className="font-semibold text-slate-900">Pusat Tindakan & Peringatan</h3>
          </div>
          <span className="text-xs text-slate-500 font-mono tabular-nums">
            {alerts.length} item prioritas
          </span>
        </div>

        {alerts.length === 0 ? (
          <div className="flex items-center gap-2.5 text-sm text-emerald-700 py-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>
              Semua operasional berjalan normal. Tidak ada keterlambatan atau pengajuan tertunda.
            </span>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {alerts.map((al) => (
              <div
                key={al.id}
                className="py-3 first:pt-1 last:pb-1 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${
                        al.tone === 'danger'
                          ? 'bg-rose-500'
                          : al.tone === 'warn'
                            ? 'bg-amber-500'
                            : 'bg-sky-500'
                      }`}
                    />
                    <p className="text-sm font-semibold text-slate-800">{al.title}</p>
                  </div>
                  <p className="text-xs text-slate-500 pl-4 mt-0.5 truncate">{al.detail}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate(al.tab)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[#2563eb] hover:text-[#1d4ed8] cursor-pointer self-start sm:self-auto shrink-0 pl-4 sm:pl-0"
                >
                  Tindak lanjuti
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Analytics Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Health & Category Utilization */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-slate-900">Kesehatan & Utilisasi Inventaris</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Proporsi kondisi aset serta distribusi per kategori perangkat.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('assets')}
              className="text-xs font-semibold text-[#2563eb] hover:text-[#1d4ed8] cursor-pointer"
            >
              Lihat aset
            </button>
          </div>

          {metrics.totalAssets === 0 ? (
            <p className="text-sm text-slate-500 py-8 text-center">
              Belum ada data inventaris untuk dianalisis.
            </p>
          ) : (
            <>
              <div>
                <div className="flex items-center justify-between text-xs text-slate-600 mb-2">
                  <span>Kesiapan Perangkat ({goodPct}% Baik)</span>
                  <span className="font-mono tabular-nums">
                    {metrics.goodAssets} Baik · {metrics.careAssets} Perawatan · {metrics.brokenAssets}{' '}
                    Rusak
                  </span>
                </div>
                <div className="h-3 w-full rounded-full bg-slate-100 overflow-hidden flex">
                  {goodPct > 0 && (
                    <div
                      className="bg-emerald-500 h-full transition-all"
                      style={{ width: `${goodPct}%` }}
                    />
                  )}
                  {carePct > 0 && (
                    <div
                      className="bg-amber-400 h-full transition-all"
                      style={{ width: `${carePct}%` }}
                    />
                  )}
                  {brokenPct > 0 && (
                    <div
                      className="bg-rose-500 h-full transition-all"
                      style={{ width: `${brokenPct}%` }}
                    />
                  )}
                </div>
              </div>

              <div className="space-y-2.5 pt-2 border-t border-slate-100">
                {metrics.categoryStats.map((cat) => {
                  const pct = Math.round((cat.total / metrics.totalAssets) * 100);
                  return (
                    <div key={cat.category} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-slate-800">{cat.category}</span>
                        <span className="text-slate-500 font-mono tabular-nums">
                          {cat.total} unit
                          {cat.borrowed > 0 ? ` · ${cat.borrowed} dipinjam` : ''}
                          {cat.issue > 0 ? ` · ${cat.issue} kendala` : ''}
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-[#2563eb]"
                          style={{ width: `${Math.max(6, pct)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* 7-Day Activity & Loan Pipeline */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-slate-900">Aktivitas 7 Hari Terakhir</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Gabungan peminjaman, jadwal praktik, dan absensi kunjungan lab.
              </p>
            </div>
            <Activity className="w-4 h-4 text-slate-400" />
          </div>

          <div className="grid grid-cols-7 gap-2 items-end h-36 pt-3 pb-1 border-b border-slate-100">
            {metrics.last7.map((day) => {
              const heightPct =
                day.total === 0 ? 6 : Math.max(14, Math.round((day.total / metrics.maxActivity) * 100));
              const isToday = day.date === today;
              return (
                <div
                  key={day.date}
                  className="flex flex-col items-center justify-end h-full gap-1.5"
                  title={`${day.date}: ${day.loansCount} pinjam, ${day.schCount} jadwal, ${day.attCount} absensi`}
                >
                  <span className="text-[11px] font-mono tabular-nums text-slate-500">
                    {day.total}
                  </span>
                  <div className="w-full max-w-[30px] flex-1 flex items-end">
                    <div
                      className={`w-full rounded-t-lg transition-all ${
                        day.total === 0
                          ? 'bg-slate-100'
                          : isToday
                            ? 'bg-[#2563eb]'
                            : 'bg-sky-400'
                      }`}
                      style={{ height: `${heightPct}%` }}
                    />
                  </div>
                  <span
                    className={`text-[10px] truncate max-w-full ${
                      isToday ? 'font-bold text-[#2563eb]' : 'text-slate-500'
                    }`}
                  >
                    {day.shortLabel}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-700">Distribusi Status Peminjaman</div>
            <div className="grid grid-cols-5 gap-2">
              {metrics.loanByStatus.map((st) => (
                <div key={st.label} className="text-left">
                  <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden mb-1.5">
                    <div
                      className={`h-full ${st.barClass}`}
                      style={{
                        width:
                          data.loans.length > 0
                            ? `${Math.max(st.count > 0 ? 15 : 0, Math.round((st.count / data.loans.length) * 100))}%`
                            : '0%',
                      }}
                    />
                  </div>
                  <div className="text-sm font-bold font-mono tabular-nums text-slate-900">
                    {st.count}
                  </div>
                  <div className="text-[11px] text-slate-500 truncate">{st.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Live Feed: Today Schedules & Active Visitors / Maintenance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-emerald-600" />
              <h3 className="font-semibold text-slate-900">Agenda Lab Hari Ini & Terbaru</h3>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('schedules')}
              className="text-xs font-semibold text-[#2563eb] hover:text-[#1d4ed8] cursor-pointer"
            >
              Lihat semua
            </button>
          </div>
          {data.schedules.length === 0 ? (
            <p className="text-sm text-slate-500 py-6 text-center">
              Belum ada jadwal penggunaan laboratorium.
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {(metrics.todaySchedules.length > 0
                ? metrics.todaySchedules
                : data.schedules.slice(0, 5)
              ).map((s) => (
                <div key={s.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{s.activity}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {s.date} · {s.startTime}–{s.endTime} · {s.requesterName} ({s.unit})
                    </p>
                  </div>
                  <span
                    className={`shrink-0 text-xs font-semibold ${
                      s.status === 'Disetujui'
                        ? 'text-emerald-700'
                        : s.status === 'Menunggu'
                          ? 'text-amber-700'
                          : s.status === 'Ditolak'
                            ? 'text-rose-600'
                            : 'text-slate-600'
                    }`}
                  >
                    {s.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-900">Pengunjung Aktif & Perawatan Terbaru</h3>
            <button
              type="button"
              onClick={() => onNavigate('attendances')}
              className="text-xs font-semibold text-[#2563eb] hover:text-[#1d4ed8] cursor-pointer"
            >
              Buka absensi
            </button>
          </div>

          {metrics.activeVisitors.length === 0 && data.maintenances.length === 0 ? (
            <p className="text-sm text-slate-500 py-6 text-center">
              Belum ada pengunjung aktif di lab atau log perawatan berjalan.
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {metrics.activeVisitors.slice(0, 3).map((att) => (
                <div key={att.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">
                      {att.visitorName}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5 truncate">
                      Masuk {att.checkInTime} · {att.unit} · {att.workstation || 'Tanpa PC'}
                    </p>
                  </div>
                  <span className="text-xs font-semibold text-emerald-700 shrink-0">
                    Di Lab
                  </span>
                </div>
              ))}
              {data.maintenances.slice(0, 3).map((m) => (
                <div key={m.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">
                      {m.assetName} — {m.issue}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5 truncate">
                      {m.maintenanceDate} · Teknisi: {m.technicianName}
                    </p>
                  </div>
                  <span
                    className={`text-xs font-semibold shrink-0 ${
                      m.status === 'Selesai'
                        ? 'text-emerald-700'
                        : m.status === 'Dalam Proses'
                          ? 'text-blue-700'
                          : 'text-amber-700'
                    }`}
                  >
                    {m.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
