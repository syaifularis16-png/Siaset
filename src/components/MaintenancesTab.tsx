import React, { useMemo, useState } from 'react';
import { Check, Pencil, Play, Plus, Search, Trash2, Wrench, X } from 'lucide-react';
import { apiFetch } from '../lib/api';
import {
  ASSET_CONDITIONS,
  MAINTENANCE_STATUSES,
  todayIsoDate,
  type Asset,
  type AssetCondition,
  type Maintenance,
  type MaintenanceStatus,
  type UserProfile,
} from '../types';

interface MaintenancesTabProps {
  maintenances: Maintenance[];
  assets: Asset[];
  profile: UserProfile;
  isAdmin: boolean;
  onRefresh: () => Promise<void>;
  onNotify: (msg: string, type?: 'success' | 'error') => void;
}

export const MaintenancesTab: React.FC<MaintenancesTabProps> = ({
  maintenances,
  assets,
  profile,
  isAdmin,
  onRefresh,
  onNotify,
}) => {
  const today = todayIsoDate();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | MaintenanceStatus>('ALL');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [assetId, setAssetId] = useState('');
  const [issue, setIssue] = useState('');
  const [actionTaken, setActionTaken] = useState('');
  const [technicianName, setTechnicianName] = useState(profile.displayName);
  const [maintenanceDate, setMaintenanceDate] = useState(today);
  const [status, setStatus] = useState<MaintenanceStatus>('Dijadwalkan');
  const [resultingCondition, setResultingCondition] = useState<AssetCondition>('Baik');
  const [syncAssetCondition, setSyncAssetCondition] = useState(true);
  const [saving, setSaving] = useState(false);

  const attentionAssets = useMemo(
    () =>
      assets.filter(
        (a) =>
          a.condition !== 'Baik' ||
          (a.nextMaintenanceDate && a.nextMaintenanceDate <= today)
      ),
    [assets, today]
  );

  const stats = useMemo(() => {
    const scheduled = maintenances.filter((m) => m.status === 'Dijadwalkan').length;
    const inProgress = maintenances.filter((m) => m.status === 'Dalam Proses').length;
    const completed = maintenances.filter((m) => m.status === 'Selesai').length;
    return {
      scheduled,
      inProgress,
      completed,
      attentionCount: attentionAssets.length,
    };
  }, [maintenances, attentionAssets]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return maintenances.filter((m) => {
      if (statusFilter !== 'ALL' && m.status !== statusFilter) return false;
      if (!q) return true;
      return (
        m.assetName.toLowerCase().includes(q) ||
        m.assetCode.toLowerCase().includes(q) ||
        m.issue.toLowerCase().includes(q) ||
        m.technicianName.toLowerCase().includes(q) ||
        m.actionTaken.toLowerCase().includes(q)
      );
    });
  }, [maintenances, search, statusFilter]);

  const openCreate = (preselectedAssetId?: string) => {
    setEditingId(null);
    setAssetId(preselectedAssetId || assets[0]?.id || '');
    setIssue('');
    setActionTaken('');
    setTechnicianName(profile.displayName);
    setMaintenanceDate(today);
    setStatus('Dijadwalkan');
    setResultingCondition('Baik');
    setSyncAssetCondition(true);
    setModalOpen(true);
  };

  const openEdit = (m: Maintenance) => {
    setEditingId(m.id);
    setAssetId(m.assetId);
    setIssue(m.issue);
    setActionTaken(m.actionTaken);
    setTechnicianName(m.technicianName);
    setMaintenanceDate(m.maintenanceDate);
    setStatus(m.status);
    setResultingCondition(m.resultingCondition);
    setSyncAssetCondition(true);
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingId) {
        await apiFetch(`/api/maintenances/${editingId}`, {
          method: 'PUT',
          body: JSON.stringify({
            issue,
            actionTaken,
            technicianName,
            maintenanceDate,
            status,
            resultingCondition,
            syncAssetCondition,
          }),
        });
        onNotify('Catatan perawatan berhasil diperbarui.');
      } else {
        await apiFetch('/api/maintenances', {
          method: 'POST',
          body: JSON.stringify({
            assetId,
            issue,
            actionTaken,
            technicianName,
            maintenanceDate,
            status,
            resultingCondition,
            syncAssetCondition,
          }),
        });
        onNotify('Catatan perawatan baru ditambahkan.');
      }
      setModalOpen(false);
      await onRefresh();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Gagal menyimpan perawatan.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleQuickStatus = async (m: Maintenance, nextStatus: MaintenanceStatus) => {
    try {
      await apiFetch(`/api/maintenances/${m.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          status: nextStatus,
          syncAssetCondition: nextStatus === 'Selesai',
        }),
      });
      onNotify(`Perawatan ${m.assetCode} diubah ke ${nextStatus}.`);
      await onRefresh();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Gagal memperbarui status.', 'error');
    }
  };

  const handleDelete = async (m: Maintenance) => {
    try {
      await apiFetch(`/api/maintenances/${m.id}`, { method: 'DELETE' });
      onNotify('Catatan perawatan dihapus.');
      await onRefresh();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Gagal menghapus catatan.', 'error');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">
            Perawatan & Perbaikan
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Log pemeliharaan perangkat, antrean servis aset bermasalah, dan sinkronisasi kondisi.
          </p>
        </div>
        {isAdmin && (
          <button
            type="button"
            disabled={assets.length === 0}
            onClick={() => openCreate()}
            className="px-4 py-2.5 rounded-xl bg-[#2563eb] hover:bg-[#1d4ed8] disabled:opacity-50 text-white text-sm font-semibold inline-flex items-center gap-1.5 cursor-pointer self-start sm:self-auto shadow-xs"
          >
            <Plus className="w-4 h-4" />
            Catat Perawatan
          </button>
        )}
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white rounded-2xl border border-slate-200/90 px-4 py-3.5">
          <div className="text-xs text-slate-500">Dijadwalkan</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-amber-600 mt-0.5">
            {stats.scheduled}
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200/90 px-4 py-3.5">
          <div className="text-xs text-slate-500">Dalam Proses</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-blue-600 mt-0.5">
            {stats.inProgress}
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200/90 px-4 py-3.5">
          <div className="text-xs text-slate-500">Selesai</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-emerald-700 mt-0.5">
            {stats.completed}
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200/90 px-4 py-3.5">
          <div className="text-xs text-slate-500">Aset Perlu Perhatian</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-rose-600 mt-0.5">
            {stats.attentionCount}
          </div>
        </div>
      </div>

      {/* Assets Needing Maintenance Strip */}
      {attentionAssets.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200/90 p-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
            <Wrench className="w-3.5 h-3.5 text-amber-600" />
            Aset Prioritas Servis / Kondisi Tidak Baik ({attentionAssets.length})
          </div>
          <div className="divide-y divide-slate-100">
            {attentionAssets.slice(0, 5).map((a) => (
              <div
                key={a.id}
                className="py-2.5 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-800 truncate">
                    [{a.code}] {a.name}
                  </div>
                  <div className="text-xs text-slate-500">
                    Kondisi: <span className="font-medium text-amber-700">{a.condition}</span> ·{' '}
                    {a.location}
                    {a.nextMaintenanceDate ? ` · Jadwal servis: ${a.nextMaintenanceDate}` : ''}
                  </div>
                </div>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => openCreate(a.id)}
                    className="px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold cursor-pointer self-start sm:self-auto shrink-0"
                  >
                    Buat Tiket Servis
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Search & Filter */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari perangkat, keluhan, teknisi..."
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-white border border-slate-200 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#2563eb]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-200/60 rounded-xl">
          {(['ALL', ...MAINTENANCE_STATUSES] as const).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                statusFilter === st
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {st === 'ALL' ? 'Semua' : st}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200/90 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Perangkat</th>
                <th className="px-4 py-3 font-semibold">Keluhan & Tindakan</th>
                <th className="px-4 py-3 font-semibold">Teknisi & Tanggal</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Kondisi Akhir</th>
                {isAdmin && <th className="px-4 py-3 font-semibold text-right">Aksi</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 6 : 5} className="px-4 py-10 text-center text-slate-500">
                    Tidak ada log perawatan yang sesuai.
                  </td>
                </tr>
              ) : (
                filtered.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-900">{m.assetName}</div>
                      <div className="font-mono text-xs text-slate-500">{m.assetCode}</div>
                    </td>
                    <td className="px-4 py-3 max-w-xs">
                      <div className="font-medium text-slate-800">{m.issue}</div>
                      {m.actionTaken && (
                        <div className="text-xs text-slate-500 mt-0.5">{m.actionTaken}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-slate-800">{m.technicianName}</div>
                      <div className="font-mono text-xs text-slate-500">{m.maintenanceDate}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs font-semibold ${
                          m.status === 'Selesai'
                            ? 'text-emerald-700'
                            : m.status === 'Dalam Proses'
                              ? 'text-blue-700'
                              : 'text-amber-700'
                        }`}
                      >
                        {m.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{m.resultingCondition}</td>
                    {isAdmin && (
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          {m.status === 'Dijadwalkan' && (
                            <button
                              type="button"
                              onClick={() => handleQuickStatus(m, 'Dalam Proses')}
                              title="Mulai Proses"
                              className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 cursor-pointer"
                            >
                              <Play className="w-4 h-4" />
                            </button>
                          )}
                          {m.status === 'Dalam Proses' && (
                            <button
                              type="button"
                              onClick={() => handleQuickStatus(m, 'Selesai')}
                              title="Tandai Selesai"
                              className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 cursor-pointer"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => openEdit(m)}
                            title="Edit"
                            className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 cursor-pointer"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(m)}
                            title="Hapus"
                            className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h3 className="font-bold text-slate-900">
                {editingId ? 'Edit Catatan Perawatan' : 'Catat Perawatan Perangkat'}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              {!editingId && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Perangkat *
                  </label>
                  <select
                    required
                    value={assetId}
                    onChange={(e) => setAssetId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white"
                  >
                    {assets.map((a) => (
                      <option key={a.id} value={a.id}>
                        [{a.code}] {a.name} ({a.condition})
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Keluhan / Masalah *
                </label>
                <input
                  type="text"
                  required
                  value={issue}
                  onChange={(e) => setIssue(e.target.value)}
                  placeholder="cth. Tinta printer tersumbat / OS lambat"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Tindakan Perbaikan
                </label>
                <input
                  type="text"
                  value={actionTaken}
                  onChange={(e) => setActionTaken(e.target.value)}
                  placeholder="cth. Pembersihan head & instal ulang driver"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Teknisi *</label>
                  <input
                    type="text"
                    required
                    value={technicianName}
                    onChange={(e) => setTechnicianName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Tanggal *</label>
                  <input
                    type="date"
                    required
                    value={maintenanceDate}
                    onChange={(e) => setMaintenanceDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Status *</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as MaintenanceStatus)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white"
                  >
                    {MAINTENANCE_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Kondisi Hasil *
                  </label>
                  <select
                    value={resultingCondition}
                    onChange={(e) => setResultingCondition(e.target.value as AssetCondition)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white"
                  >
                    {ASSET_CONDITIONS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={syncAssetCondition}
                  onChange={(e) => setSyncAssetCondition(e.target.checked)}
                  className="rounded border-slate-300"
                />
                Sinkronkan kondisi perangkat di tabel Inventaris Aset
              </label>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded-xl text-sm font-semibold bg-[#2563eb] hover:bg-[#1d4ed8] disabled:opacity-60 text-white cursor-pointer"
                >
                  {saving ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
