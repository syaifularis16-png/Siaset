import React, { useMemo, useState } from 'react';
import { Plus, Search, Sparkles, X } from 'lucide-react';
import { apiFetch } from '../lib/api';
import {
  ASSET_CATEGORIES,
  ASSET_CONDITIONS,
  DEFAULT_BRANDING,
  type Asset,
  type AssetCategory,
  type AssetCondition,
  type BrandingSettings,
} from '../types';
import { AssetQrModal } from './AssetQrModal';

interface AssetsTabProps {
  assets: Asset[];
  branding?: BrandingSettings;
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
  branding = DEFAULT_BRANDING,
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Inventaris</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Kelola aset: tambah perangkat, ubah data, atau hapus aset yang tidak digunakan.
          </p>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2 shrink-0">
            {assets.length === 0 && (
              <button
                type="button"
                disabled={saving}
                onClick={handleSeedSamples}
                className="px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <Sparkles className="w-4 h-4 text-[#2563eb]" />
                Muat Contoh Aset
              </button>
            )}
            <button
              type="button"
              onClick={openCreate}
              className="px-4 py-2.5 rounded-xl bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-sm font-semibold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shadow-xs transition-colors"
            >
              <Plus className="w-4 h-4" />
              Tambah Aset
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari kode, nama, merek..."
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-white border border-slate-200 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#2563eb]"
          />
        </div>
        <select
          value={conditionFilter}
          onChange={(e) => setConditionFilter(e.target.value)}
          className="px-3.5 py-2 rounded-xl border border-slate-200 text-sm text-slate-700 bg-white focus:outline-none focus:border-[#2563eb]"
        >
          <option value="ALL">Semua kondisi</option>
          {ASSET_CONDITIONS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="px-3.5 py-2 rounded-xl border border-slate-200 text-sm text-slate-700 bg-white focus:outline-none focus:border-[#2563eb]"
        >
          <option value="ALL">Semua kategori</option>
          {ASSET_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/90 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-100 text-[11px] uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-5 py-3.5 font-semibold">Kode</th>
                <th className="px-5 py-3.5 font-semibold">Nama Aset</th>
                <th className="px-5 py-3.5 font-semibold">Kategori</th>
                <th className="px-5 py-3.5 font-semibold">Merek</th>
                <th className="px-5 py-3.5 font-semibold">Kondisi</th>
                <th className="px-5 py-3.5 font-semibold">Lokasi</th>
                <th className="px-5 py-3.5 font-semibold">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-slate-500">
                    {assets.length === 0
                      ? 'Belum ada aset inventaris. Klik Tambah Aset atau Muat Contoh Aset untuk memulai.'
                      : 'Tidak ada aset yang sesuai dengan pencarian.'}
                  </td>
                </tr>
              ) : (
                filtered.map((asset) => (
                  <tr key={asset.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-5 py-4 font-mono tabular-nums text-[13px] text-slate-800 whitespace-nowrap">
                      {asset.code}
                    </td>
                    <td className="px-5 py-4 font-medium text-slate-900">{asset.name}</td>
                    <td className="px-5 py-4 text-slate-600">{asset.category}</td>
                    <td className="px-5 py-4 text-slate-600">{asset.brand}</td>
                    <td className="px-5 py-4 whitespace-nowrap">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-md text-xs font-medium ${
                          asset.condition === 'Baik'
                            ? 'bg-emerald-50 text-emerald-700'
                            : asset.condition === 'Perlu perawatan'
                              ? 'bg-amber-50 text-amber-700'
                              : 'bg-rose-50 text-rose-700'
                        }`}
                      >
                        {asset.condition}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-slate-600">{asset.location}</td>
                    <td className="px-5 py-4 whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setQrAsset(asset)}
                          className="px-2.5 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-600 text-xs font-semibold cursor-pointer transition-colors"
                        >
                          Detail / QR
                        </button>
                        {isAdmin && (
                          <>
                            <button
                              type="button"
                              onClick={() => openEdit(asset)}
                              className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold cursor-pointer transition-colors"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(asset)}
                              className="px-2.5 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-semibold cursor-pointer transition-colors"
                            >
                              Hapus
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
                  className="px-4 py-2 rounded-xl text-sm font-semibold bg-[#2563eb] hover:bg-[#1d4ed8] disabled:opacity-60 text-white cursor-pointer"
                >
                  {saving ? 'Menyimpan...' : 'Simpan Aset'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <AssetQrModal asset={qrAsset} branding={branding} onClose={() => setQrAsset(null)} />
    </div>
  );
};
