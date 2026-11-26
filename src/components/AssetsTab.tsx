import React, { useMemo, useState } from 'react';
import { Plus, QrCode, Pencil, Trash2, Search, Sparkles, X } from 'lucide-react';
import { apiFetch } from '../lib/api';
import {
  ASSET_CATEGORIES,
  ASSET_CONDITIONS,
  type Asset,
  type AssetCategory,
  type AssetCondition,
} from '../types';
import { AssetQrModal } from './AssetQrModal';

interface AssetsTabProps {
  assets: Asset[];
  isAdmin: boolean;
  onRefresh: () => Promise<void>;
  onNotify: (msg: string, type?: 'success' | 'error') => void;
}

const emptyForm = {
  code: '',
  name: '',
  category: 'Komputer' as AssetCategory,
  brand: '',
  condition: 'Baik' as AssetCondition,
  location: 'Lab Komputer Akuntansi',
  fundingSource: 'BOS',
  procurementYear: new Date().getFullYear(),
  nextMaintenanceDate: '',
};

export const AssetsTab: React.FC<AssetsTabProps> = ({
  assets,
  isAdmin,
  onRefresh,
  onNotify,
}) => {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [conditionFilter, setConditionFilter] = useState<string>('ALL');
  const [qrAsset, setQrAsset] = useState<Asset | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return assets.filter((item) => {
      if (categoryFilter !== 'ALL' && item.category !== categoryFilter) return false;
      if (conditionFilter !== 'ALL' && item.condition !== conditionFilter) return false;
      if (!q) return true;
      return (
        item.code.toLowerCase().includes(q) ||
        item.name.toLowerCase().includes(q) ||
        item.brand.toLowerCase().includes(q) ||
        item.location.toLowerCase().includes(q)
      );
    });
  }, [assets, search, categoryFilter, conditionFilter]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEdit = (asset: Asset) => {
    setEditingId(asset.id);
    setForm({
      code: asset.code,
      name: asset.name,
      category: asset.category,
      brand: asset.brand,
      condition: asset.condition,
      location: asset.location,
      fundingSource: asset.fundingSource,
      procurementYear: asset.procurementYear,
      nextMaintenanceDate: asset.nextMaintenanceDate,
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingId) {
        await apiFetch(`/api/assets/${editingId}`, {
          method: 'PUT',
          body: JSON.stringify(form),
        });
        onNotify('Data aset berhasil diperbarui.');
      } else {
        await apiFetch('/api/assets', {
          method: 'POST',
          body: JSON.stringify(form),
        });
        onNotify('Aset baru berhasil ditambahkan.');
      }
      setModalOpen(false);
      await onRefresh();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Gagal menyimpan aset.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (asset: Asset) => {
    try {
      await apiFetch(`/api/assets/${asset.id}`, { method: 'DELETE' });
      onNotify(`Aset ${asset.code} dihapus.`);
      await onRefresh();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Gagal menghapus aset.', 'error');
    }
  };

  const handleSeedSamples = async () => {
    setSaving(true);
    try {
      await apiFetch('/api/assets/seed-samples', { method: 'POST' });
      onNotify('Contoh data aset laboratorium berhasil dimuat.');
      await onRefresh();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Gagal memuat contoh aset.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Inventaris & QR Aset</h2>
          <p className="text-sm text-slate-500">
            Kelola perangkat keras laboratorium beserta kode QR pelacakan.
          </p>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2">
            {assets.length === 0 && (
              <button
                type="button"
                disabled={saving}
                onClick={handleSeedSamples}
                className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Sparkles className="w-4 h-4 text-indigo-600" />
                Muat Contoh Aset
              </button>
            )}
            <button
              type="button"
              onClick={openCreate}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Tambah Aset
            </button>
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari kode, nama perangkat, merek, atau lokasi..."
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-indigo-500"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:border-indigo-500"
        >
          <option value="ALL">Semua Kategori</option>
          {ASSET_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={conditionFilter}
          onChange={(e) => setConditionFilter(e.target.value)}
          className="px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:border-indigo-500"
        >
          <option value="ALL">Semua Kondisi</option>
          {ASSET_CONDITIONS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Kode</th>
                <th className="px-4 py-3 font-semibold">Perangkat</th>
                <th className="px-4 py-3 font-semibold">Kategori</th>
                <th className="px-4 py-3 font-semibold">Lokasi</th>
                <th className="px-4 py-3 font-semibold">Kondisi</th>
                <th className="px-4 py-3 font-semibold">Tahun</th>
                <th className="px-4 py-3 font-semibold text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                    Tidak ada aset yang sesuai dengan filter.
                  </td>
                </tr>
              ) : (
                filtered.map((asset) => (
                  <tr key={asset.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-800">
                      {asset.code}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-900">{asset.name}</div>
                      <div className="text-xs text-slate-500">
                        {asset.brand}
                        {asset.fundingSource ? ` • ${asset.fundingSource}` : ''}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{asset.category}</td>
                    <td className="px-4 py-3 text-slate-700">{asset.location}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-md text-xs font-medium border ${
                          asset.condition === 'Baik'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : asset.condition === 'Perlu perawatan'
                              ? 'bg-amber-50 text-amber-700 border-amber-200'
                              : 'bg-rose-50 text-rose-700 border-rose-200'
                        }`}
                      >
                        {asset.condition}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">
                      {asset.procurementYear}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setQrAsset(asset)}
                          title="Lihat QR Code"
                          className="p-1.5 rounded-lg text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 cursor-pointer"
                        >
                          <QrCode className="w-4 h-4" />
                        </button>
                        {isAdmin && (
                          <>
                            <button
                              type="button"
                              onClick={() => openEdit(asset)}
                              title="Edit Aset"
                              className="p-1.5 rounded-lg text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 cursor-pointer"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(asset)}
                              title="Hapus Aset"
                              className="p-1.5 rounded-lg text-slate-600 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
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
                {editingId ? 'Edit Data Aset' : 'Tambah Aset Baru'}
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Kode Inventaris *
                  </label>
                  <input
                    type="text"
                    required
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value })}
                    placeholder="LAB-PC-001"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Nama Perangkat *
                  </label>
                  <input
                    type="text"
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Komputer Praktik 01"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Kategori *
                  </label>
                  <select
                    value={form.category}
                    onChange={(e) =>
                      setForm({ ...form, category: e.target.value as AssetCategory })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white"
                  >
                    {ASSET_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Merek / Tipe *
                  </label>
                  <input
                    type="text"
                    required
                    value={form.brand}
                    onChange={(e) => setForm({ ...form, brand: e.target.value })}
                    placeholder="Lenovo / Epson / Acer"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Kondisi *
                  </label>
                  <select
                    value={form.condition}
                    onChange={(e) =>
                      setForm({ ...form, condition: e.target.value as AssetCondition })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white"
                  >
                    {ASSET_CONDITIONS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Lokasi Ruangan *
                  </label>
                  <input
                    type="text"
                    required
                    value={form.location}
                    onChange={(e) => setForm({ ...form, location: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Sumber Dana
                  </label>
                  <input
                    type="text"
                    value={form.fundingSource}
                    onChange={(e) => setForm({ ...form, fundingSource: e.target.value })}
                    placeholder="BOS / APBD / Komite"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Tahun Pengadaan
                  </label>
                  <input
                    type="number"
                    min={1990}
                    max={2100}
                    value={form.procurementYear}
                    onChange={(e) =>
                      setForm({ ...form, procurementYear: Number(e.target.value) || 2026 })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Jadwal Perawatan Berikutnya (Opsional)
                </label>
                <input
                  type="date"
                  value={form.nextMaintenanceDate}
                  onChange={(e) => setForm({ ...form, nextMaintenanceDate: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                />
              </div>

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
                  {saving ? 'Menyimpan...' : 'Simpan Aset'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <AssetQrModal asset={qrAsset} onClose={() => setQrAsset(null)} />
    </div>
  );
};
