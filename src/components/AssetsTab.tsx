import React, { useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  Copy,
  Plus,
  Printer,
  Search,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import {
  ASSET_CATEGORIES,
  ASSET_CONDITIONS,
  DEFAULT_BRANDING,
  todayIsoDate,
  type Asset,
  type AssetCategory,
  type AssetCondition,
  type AssetLock,
  type BrandingSettings,
  type Loan,
  type Maintenance,
} from '../types';
import { AssetQrModal } from './AssetQrModal';

interface AssetsTabProps {
  assets: Asset[];
  loans?: Loan[];
  assetLocks?: AssetLock[];
  maintenances?: Maintenance[];
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

function incrementAssetCode(code: string): string {
  const match = code.match(/^(.*?)(\d+)$/);
  if (!match) return `${code}-COPY`;
  const prefix = match[1];
  const num = match[2];
  const next = String(Number(num) + 1).padStart(num.length, '0');
  return `${prefix}${next}`;
}

function parseCsvAssets(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];

  const splitLine = (line: string) => {
    const delimiter = line.includes(';') && !line.includes(',') ? ';' : ',';
    const cols: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === delimiter && !inQuotes) {
        cols.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    cols.push(current.trim());
    return cols;
  };

  const firstCols = splitLine(lines[0]).map((c) => c.toLowerCase());
  const hasHeader =
    firstCols[0]?.includes('kode') ||
    firstCols[0]?.includes('code') ||
    firstCols[1]?.includes('nama');
  const dataLines = hasHeader ? lines.slice(1) : lines;

  return dataLines.map((line) => {
    const [
      code = '',
      name = '',
      category = 'Komputer',
      brand = '-',
      condition = 'Baik',
      location = 'Lab Komputer',
      fundingSource = 'BOS',
      yearStr = '',
      nextMaintenanceDate = '',
    ] = splitLine(line);
    return {
      code,
      name,
      category,
      brand,
      condition,
      location,
      fundingSource,
      procurementYear: Number(yearStr) || new Date().getFullYear(),
      nextMaintenanceDate,
    };
  });
}

export const AssetsTab: React.FC<AssetsTabProps> = ({
  assets,
  loans = [],
  assetLocks = [],
  maintenances = [],
  branding = DEFAULT_BRANDING,
  isAdmin,
  onRefresh,
  onNotify,
}) => {
  const today = todayIsoDate();
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [conditionFilter, setConditionFilter] = useState<string>('ALL');
  const [locationFilter, setLocationFilter] = useState<string>('ALL');
  const [availabilityFilter, setAvailabilityFilter] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<'code' | 'name' | 'yearDesc' | 'condition'>('code');

  const [qrAsset, setQrAsset] = useState<Asset | null>(null);
  const [bulkPrintOpen, setBulkPrintOpen] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const [importOpen, setImportOpen] = useState(false);
  const [csvText, setCsvText] = useState(
    'LAB-PC-010,Komputer Praktik 10,Komputer,Lenovo,Baik,Lab Komputer 1,BOS,2025,\nLAB-PRJ-002,Proyektor Epson,Proyektor,Epson,Baik,Lab Komputer 1,APBD,2024,'
  );
  const [importing, setImporting] = useState(false);

  const activeLoanByAsset = useMemo(() => {
    const map = new Map<string, { status: 'Disetujui' | 'Dipinjam'; borrowerName?: string }>();
    for (const lock of assetLocks) {
      map.set(lock.assetId, { status: lock.status });
    }
    for (const loan of loans) {
      if (loan.status === 'Dipinjam' || loan.status === 'Disetujui') {
        const existing = map.get(loan.assetId);
        if (!existing || existing.status === 'Disetujui' || loan.status === 'Dipinjam') {
          map.set(loan.assetId, {
            status: loan.status,
            borrowerName: loan.borrowerName,
          });
        }
      }
    }
    return map;
  }, [assetLocks, loans]);

  const uniqueLocations = useMemo(() => {
    const set = new Set<string>();
    for (const a of assets) {
      if (a.location) set.add(a.location);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [assets]);

  const kpis = useMemo(() => {
    const total = assets.length;
    const good = assets.filter((a) => a.condition === 'Baik').length;
    const borrowed = assets.filter((a) => activeLoanByAsset.has(a.id)).length;
    const attention = assets.filter(
      (a) =>
        a.condition !== 'Baik' ||
        (a.nextMaintenanceDate && a.nextMaintenanceDate <= today)
    ).length;
    return { total, good, borrowed, attention };
  }, [assets, activeLoanByAsset, today]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = assets.filter((item) => {
      if (categoryFilter !== 'ALL' && item.category !== categoryFilter) return false;
      if (conditionFilter !== 'ALL' && item.condition !== conditionFilter) return false;
      if (locationFilter !== 'ALL' && item.location !== locationFilter) return false;

      const isBorrowed = activeLoanByAsset.has(item.id);
      const isDueMaint = Boolean(item.nextMaintenanceDate && item.nextMaintenanceDate <= today);
      if (availabilityFilter === 'AVAILABLE' && (isBorrowed || item.condition === 'Rusak')) {
        return false;
      }
      if (availabilityFilter === 'BORROWED' && !isBorrowed) return false;
      if (availabilityFilter === 'DUE_MAINT' && !isDueMaint) return false;

      if (!q) return true;
      return (
        item.code.toLowerCase().includes(q) ||
        item.name.toLowerCase().includes(q) ||
        item.brand.toLowerCase().includes(q) ||
        item.location.toLowerCase().includes(q) ||
        item.fundingSource.toLowerCase().includes(q)
      );
    });

    return [...list].sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'yearDesc') return b.procurementYear - a.procurementYear;
      if (sortBy === 'condition') return a.condition.localeCompare(b.condition);
      return a.code.localeCompare(b.code);
    });
  }, [
    assets,
    search,
    categoryFilter,
    conditionFilter,
    locationFilter,
    availabilityFilter,
    sortBy,
    activeLoanByAsset,
    today,
  ]);

  const parsedPreview = useMemo(() => parseCsvAssets(csvText), [csvText]);

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

  const openDuplicate = (asset: Asset) => {
    setEditingId(null);
    setForm({
      code: incrementAssetCode(asset.code),
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

  const handleCsvFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setCsvText(reader.result);
      }
    };
    reader.readAsText(file);
  };

  const handleBulkImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (parsedPreview.length === 0) {
      onNotify('Tidak ada baris valid untuk diimpor.', 'error');
      return;
    }
    setImporting(true);
    try {
      await apiFetch('/api/assets/import', {
        method: 'POST',
        body: JSON.stringify({ items: parsedPreview }),
      });
      onNotify(`${parsedPreview.length} aset berhasil diimpor.`);
      setImportOpen(false);
      await onRefresh();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Gagal mengimpor aset.', 'error');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Inventaris</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Kelola perangkat, pantau status peminjaman aktif, riwayat servis, dan label QR.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {filtered.length > 0 && (
            <button
              type="button"
              onClick={() => setBulkPrintOpen(true)}
              className="px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Printer className="w-4 h-4 text-slate-500" />
              Cetak QR ({filtered.length})
            </button>
          )}
          {isAdmin && (
            <>
              {assets.length === 0 && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={handleSeedSamples}
                  className="px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <Sparkles className="w-4 h-4 text-[#2563eb]" />
                  Muat Contoh
                </button>
              )}
              <button
                type="button"
                onClick={() => setImportOpen(true)}
                className="px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <Upload className="w-4 h-4 text-slate-500" />
                Impor CSV
              </button>
              <button
                type="button"
                onClick={openCreate}
                className="px-4 py-2.5 rounded-xl bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-sm font-semibold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shadow-xs transition-colors"
              >
                <Plus className="w-4 h-4" />
                Tambah Aset
              </button>
            </>
          )}
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white rounded-2xl border border-slate-200/90 px-4 py-3.5">
          <div className="text-xs text-slate-500">Total Aset</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-0.5">
            {kpis.total}
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200/90 px-4 py-3.5">
          <div className="text-xs text-slate-500">Kondisi Baik</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-emerald-700 mt-0.5">
            {kpis.good}
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200/90 px-4 py-3.5">
          <div className="text-xs text-slate-500">Disetujui / Dipinjam</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-amber-600 mt-0.5">
            {kpis.borrowed}
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200/90 px-4 py-3.5">
          <div className="text-xs text-slate-500">Butuh Perhatian / Servis</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-rose-600 mt-0.5">
            {kpis.attention}
          </div>
        </div>
      </div>

      {/* Filter & Sort Controls */}
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative w-full sm:w-60">
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
          className="px-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-700 bg-white focus:outline-none focus:border-[#2563eb]"
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
          className="px-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-700 bg-white focus:outline-none focus:border-[#2563eb]"
        >
          <option value="ALL">Semua kategori</option>
          {ASSET_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={locationFilter}
          onChange={(e) => setLocationFilter(e.target.value)}
          className="px-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-700 bg-white focus:outline-none focus:border-[#2563eb]"
        >
          <option value="ALL">Semua ruangan</option>
          {uniqueLocations.map((loc) => (
            <option key={loc} value={loc}>
              {loc}
            </option>
          ))}
        </select>
        <select
          value={availabilityFilter}
          onChange={(e) => setAvailabilityFilter(e.target.value)}
          className="px-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-700 bg-white focus:outline-none focus:border-[#2563eb]"
        >
          <option value="ALL">Semua status</option>
          <option value="AVAILABLE">Tersedia</option>
          <option value="BORROWED">Disetujui / Dipinjam</option>
          <option value="DUE_MAINT">Jatuh Tempo Servis</option>
        </select>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
          className="px-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-700 bg-white focus:outline-none focus:border-[#2563eb]"
        >
          <option value="code">Urut: Kode</option>
          <option value="name">Urut: Nama</option>
          <option value="yearDesc">Urut: Tahun Terbaru</option>
          <option value="condition">Urut: Kondisi</option>
        </select>
      </div>

      {/* Assets Table */}
      <div className="bg-white rounded-2xl border border-slate-200/90 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-100 text-[11px] uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-5 py-3.5 font-semibold">Kode</th>
                <th className="px-5 py-3.5 font-semibold">Nama Aset</th>
                <th className="px-5 py-3.5 font-semibold">Kategori & Merek</th>
                <th className="px-5 py-3.5 font-semibold">Kondisi</th>
                <th className="px-5 py-3.5 font-semibold">Lokasi & Status</th>
                <th className="px-5 py-3.5 font-semibold text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-slate-500">
                    {assets.length === 0
                      ? 'Belum ada aset inventaris. Klik Tambah Aset atau Muat Contoh untuk memulai.'
                      : 'Tidak ada aset yang sesuai dengan filter pencarian.'}
                  </td>
                </tr>
              ) : (
                filtered.map((asset) => {
                  const activeLoan = activeLoanByAsset.get(asset.id);
                  const isDueMaint = Boolean(
                    asset.nextMaintenanceDate && asset.nextMaintenanceDate <= today
                  );
                  return (
                    <tr key={asset.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-5 py-4 font-mono tabular-nums text-[13px] text-slate-800 whitespace-nowrap">
                        {asset.code}
                      </td>
                      <td className="px-5 py-4">
                        <div className="font-medium text-slate-900">{asset.name}</div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          {asset.fundingSource || '—'} · {asset.procurementYear}
                        </div>
                      </td>
                      <td className="px-5 py-4 text-slate-600">
                        <div>{asset.category}</div>
                        <div className="text-xs text-slate-400">{asset.brand}</div>
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap">
                        <div
                          className={`text-xs font-semibold ${
                            asset.condition === 'Baik'
                              ? 'text-emerald-700'
                              : asset.condition === 'Perlu perawatan'
                                ? 'text-amber-700'
                                : 'text-rose-700'
                          }`}
                        >
                          {asset.condition}
                        </div>
                        {isDueMaint && (
                          <div className="text-[11px] text-rose-600 mt-0.5">
                            Servis: {asset.nextMaintenanceDate}
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-4 text-slate-600">
                        <div>{asset.location}</div>
                        <div className="text-xs mt-0.5">
                          {activeLoan ? (
                            <span
                              className={
                                activeLoan.status === 'Dipinjam'
                                  ? 'text-amber-700 font-medium'
                                  : 'text-sky-700 font-medium'
                              }
                            >
                              {activeLoan.status === 'Dipinjam'
                                ? activeLoan.borrowerName
                                  ? `Dipinjam: ${activeLoan.borrowerName}`
                                  : 'Sedang Dipinjam (Tidak Tersedia)'
                                : activeLoan.borrowerName
                                  ? `Disetujui: ${activeLoan.borrowerName}`
                                  : 'Sudah Disetujui (Tidak Tersedia)'}
                            </span>
                          ) : asset.condition === 'Rusak' ? (
                            <span className="text-rose-600">Tidak siap pakai</span>
                          ) : (
                            <span className="text-emerald-700">Tersedia</span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap text-right">
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
                                onClick={() => openDuplicate(asset)}
                                title="Duplikat Aset"
                                className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 cursor-pointer transition-colors"
                              >
                                <Copy className="w-3.5 h-3.5" />
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
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create / Edit Asset Modal */}
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

      {/* CSV Import Modal */}
      {importOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-900">Impor Massal Aset via CSV</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Urutan kolom: Kode, Nama, Kategori, Merek, Kondisi, Lokasi, Sumber Dana, Tahun
                </p>
              </div>
              <button
                type="button"
                onClick={() => setImportOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleBulkImport} className="p-5 space-y-4 overflow-y-auto">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Unggah File .CSV atau Tempel Data
                </label>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleCsvFileUpload}
                  className="block w-full text-xs text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 mb-2.5"
                />
                <textarea
                  rows={5}
                  value={csvText}
                  onChange={(e) => setCsvText(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-mono"
                />
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-3.5 py-2 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-700">
                  Pratinjau ({parsedPreview.length} baris terdeteksi)
                </div>
                <div className="max-h-44 overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50/70 text-slate-500">
                      <tr>
                        <th className="px-3 py-2">Kode</th>
                        <th className="px-3 py-2">Nama</th>
                        <th className="px-3 py-2">Kategori</th>
                        <th className="px-3 py-2">Kondisi</th>
                        <th className="px-3 py-2">Lokasi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {parsedPreview.slice(0, 15).map((row, i) => (
                        <tr key={`${row.code}-${i}`}>
                          <td className="px-3 py-1.5 font-mono">{row.code || '—'}</td>
                          <td className="px-3 py-1.5">{row.name || '—'}</td>
                          <td className="px-3 py-1.5">{row.category}</td>
                          <td className="px-3 py-1.5">{row.condition}</td>
                          <td className="px-3 py-1.5">{row.location}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setImportOpen(false)}
                  className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={importing || parsedPreview.length === 0}
                  className="px-4 py-2 rounded-xl text-sm font-semibold bg-[#2563eb] hover:bg-[#1d4ed8] disabled:opacity-60 text-white cursor-pointer"
                >
                  {importing ? 'Mengimpor...' : `Impor ${parsedPreview.length} Aset`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk QR Label Print Modal */}
      {bulkPrintOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-900">
                  Cetak Label QR Kolektif ({filtered.length} aset)
                </h3>
                <p className="text-xs text-slate-500">
                  {branding.appName} · {branding.schoolName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setBulkPrintOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 bg-slate-50">
              <div
                data-print-root="true"
                className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-white p-4 rounded-xl"
              >
                {filtered.map((item) => (
                  <div
                    key={item.id}
                    className="border border-slate-300 rounded-xl p-3 flex flex-col items-center text-center break-inside-avoid"
                  >
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1.5 truncate max-w-full">
                      {branding.appName} · {branding.schoolName}
                    </div>
                    <QRCodeSVG
                      value={JSON.stringify({
                        code: item.code,
                        name: item.name,
                        location: item.location,
                      })}
                      size={92}
                      level="M"
                    />
                    <div className="font-mono text-[11px] font-bold text-slate-900 mt-2">
                      {item.code}
                    </div>
                    <div className="text-xs font-semibold text-slate-800 truncate max-w-full">
                      {item.name}
                    </div>
                    <div className="text-[10px] text-slate-500 truncate max-w-full">
                      {item.location}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="px-5 py-3.5 bg-white border-t border-slate-100 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setBulkPrintOpen(false)}
                className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                Tutup
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="px-4 py-2 rounded-xl text-sm font-semibold bg-[#2563eb] hover:bg-[#1d4ed8] text-white inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                Cetak Semua Label
              </button>
            </div>
          </div>
        </div>
      )}

      <AssetQrModal
        asset={qrAsset}
        branding={branding}
        loans={loans}
        assetLocks={assetLocks}
        maintenances={maintenances}
        onClose={() => setQrAsset(null)}
      />
    </div>
  );
};
