import React, { useState } from 'react';
import { Plus, Pencil, Trash2, X } from 'lucide-react';
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
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [assetId, setAssetId] = useState('');
  const [issue, setIssue] = useState('');
  const [actionTaken, setActionTaken] = useState('');
  const [technicianName, setTechnicianName] = useState(profile.displayName);
  const [maintenanceDate, setMaintenanceDate] = useState(todayIsoDate());
  const [status, setStatus] = useState<MaintenanceStatus>('Dijadwalkan');
  const [resultingCondition, setResultingCondition] = useState<AssetCondition>('Baik');
  const [syncAssetCondition, setSyncAssetCondition] = useState(true);
  const [saving, setSaving] = useState(false);

  const openCreate = () => {
    setEditingId(null);
    setAssetId(assets[0]?.id ?? '');
    setIssue('');
    setActionTaken('');
    setTechnicianName(profile.displayName);
    setMaintenanceDate(todayIsoDate());
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
          <h2 className="text-lg font-bold text-slate-900">Perawatan & Perbaikan</h2>
          <p className="text-sm text-slate-500">
            Log pemeliharaan perangkat keras dan pembaruan kondisi aset.
          </p>
        </div>
        {isAdmin && (
          <button
            type="button"
            disabled={assets.length === 0}
            onClick={openCreate}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold inline-flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            Catat Perawatan
          </button>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500">
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
              {maintenances.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 6 : 5} className="px-4 py-10 text-center text-slate-500">
                    Belum ada log perawatan perangkat.
                  </td>
                </tr>
              ) : (
                maintenances.map((m) => (
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
                      <span className="inline-block px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-100 text-slate-700">
                        {m.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{m.resultingCondition}</td>
                    {isAdmin && (
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEdit(m)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 cursor-pointer"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(m)}
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
                        [{a.code}] {a.name}
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
                  className="px-4 py-2 rounded-xl text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white cursor-pointer"
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
