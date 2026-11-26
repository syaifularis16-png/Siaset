import React from 'react';
import {
  Package,
  ClipboardList,
  CalendarClock,
  Wrench,
  UserCheck,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import type { AppDataSnapshot, UserProfile } from '../types';

interface OverviewTabProps {
  data: AppDataSnapshot;
  profile: UserProfile;
  onNavigate: (tab: 'assets' | 'loans' | 'schedules' | 'maintenances' | 'attendances') => void;
}

export const OverviewTab: React.FC<OverviewTabProps> = ({ data, profile, onNavigate }) => {
  const totalAssets = data.assets.length;
  const goodAssets = data.assets.filter((a) => a.condition === 'Baik').length;
  const attentionAssets = data.assets.filter((a) => a.condition !== 'Baik').length;
  const pendingLoans = data.loans.filter(
    (l) => l.status === 'Menunggu' || l.status === 'Dipinjam'
  ).length;
  const activeSchedules = data.schedules.filter(
    (s) => s.status === 'Menunggu' || s.status === 'Disetujui'
  ).length;
  const openMaintenance = data.maintenances.filter((m) => m.status !== 'Selesai').length;
  const activeVisitors = data.attendances.filter((a) => !a.checkOutTime).length;

  const stats = [
    {
      label: 'Total Inventaris',
      value: totalAssets,
      sub: `${goodAssets} kondisi baik`,
      icon: Package,
      color: 'bg-indigo-50 text-indigo-600 border-indigo-100',
      tab: 'assets' as const,
    },
    {
      label: 'Peminjaman Aktif',
      value: pendingLoans,
      sub: `${data.loans.length} total riwayat`,
      icon: ClipboardList,
      color: 'bg-amber-50 text-amber-600 border-amber-100',
      tab: 'loans' as const,
    },
    {
      label: 'Jadwal Lab',
      value: activeSchedules,
      sub: `${data.schedules.length} total pengajuan`,
      icon: CalendarClock,
      color: 'bg-emerald-50 text-emerald-600 border-emerald-100',
      tab: 'schedules' as const,
    },
    {
      label: 'Perawatan Berjalan',
      value: openMaintenance,
      sub: `${attentionAssets} aset butuh perhatian`,
      icon: Wrench,
      color: 'bg-rose-50 text-rose-600 border-rose-100',
      tab: 'maintenances' as const,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-slate-200 p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">
            Selamat datang, {profile.displayName}
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Unit: {profile.unit || 'SMK Negeri 1 Sambeng'} • Peran:{' '}
            <span className="font-medium capitalize text-slate-700">{profile.role}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={() => onNavigate('attendances')}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold cursor-pointer self-start sm:self-auto"
        >
          <UserCheck className="w-4 h-4" />
          Catat Absensi ({activeVisitors} aktif)
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.label}
              type="button"
              onClick={() => onNavigate(item.tab)}
              className="text-left bg-white rounded-2xl border border-slate-200 p-5 hover:border-indigo-300 hover:shadow-sm transition-all cursor-pointer"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  {item.label}
                </span>
                <div className={`p-2 rounded-xl border ${item.color}`}>
                  <Icon className="w-4 h-4" />
                </div>
              </div>
              <div className="text-3xl font-bold text-slate-900 font-mono">{item.value}</div>
              <p className="text-xs text-slate-500 mt-1">{item.sub}</p>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-900">Jadwal Penggunaan Lab Terbaru</h3>
            <button
              type="button"
              onClick={() => onNavigate('schedules')}
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 cursor-pointer"
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
              {data.schedules.slice(0, 5).map((s) => (
                <div key={s.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{s.activity}</p>
                    <p className="text-xs text-slate-500">
                      {s.date} • {s.startTime}–{s.endTime} • {s.requesterName}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs font-medium px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700">
                    {s.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-900">Kondisi Perangkat Lab</h3>
            <button
              type="button"
              onClick={() => onNavigate('assets')}
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 cursor-pointer"
            >
              Kelola aset
            </button>
          </div>
          {data.assets.length === 0 ? (
            <p className="text-sm text-slate-500 py-6 text-center">
              Belum ada data aset inventaris.
            </p>
          ) : (
            <div className="space-y-2.5">
              {data.assets.slice(0, 5).map((asset) => (
                <div
                  key={asset.id}
                  className="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{asset.name}</p>
                    <p className="text-xs text-slate-500 font-mono">
                      {asset.code} • {asset.location}
                    </p>
                  </div>
                  {asset.condition === 'Baik' ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg shrink-0">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Baik
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-lg shrink-0">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      {asset.condition}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
