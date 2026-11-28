import React, { useMemo, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  AlertTriangle,
  Check,
  Copy,
  Download,
  FileCheck2,
  Pencil,
  Plus,
  Printer,
  ScanBarcode,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { downloadLoanBarcodePng } from '../lib/imageBarcodeScanner';
import {
  buildLoanQrPayload,
  getLoanRefCode,
  isApprovedLoanStatus,
} from '../lib/loanBarcode';
import { LoanBarcodeSvg } from './LoanBarcodeSvg';
import {
  DEFAULT_BRANDING,
  LESSON_PERIOD_OPTIONS,
  LOAN_STATUSES,
  PERSON_ROLES,
  todayIsoDate,
  type Asset,
  type AssetLock,
  type BrandingSettings,
  type Loan,
  type LoanStatus,
  type PersonRole,
  type UserProfile,
} from '../types';

interface LoansTabProps {
  loans: Loan[];
  assets: Asset[];
  assetLocks?: AssetLock[];
  profile: UserProfile;
  branding?: BrandingSettings;
  isAdmin: boolean;
  onRefresh: () => Promise<void>;
  onNotify: (msg: string, type?: 'success' | 'error') => void;
}

type FilterStatus = 'ALL' | 'OVERDUE' | LoanStatus;

function diffDays(fromIso: string, toIso: string): number {
  const a = new Date(`${fromIso}T00:00:00`).getTime();
  const b = new Date(`${toIso}T00:00:00`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86400000);
}

function datesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  if (!aStart || !aEnd || !bStart || !bEnd) return false;
  return aStart <= bEnd && aEnd >= bStart;
}

export const LoansTab: React.FC<LoansTabProps> = ({
  loans,
  assets,
  assetLocks = [],
  profile,
  branding = DEFAULT_BRANDING,
  isAdmin,
  onRefresh,
  onNotify,
}) => {
  const today = todayIsoDate();
  const currentMonth = today.slice(0, 7);

  const isGuruAccount = profile.role === 'guru';
  const defaultBorrowerRole: PersonRole =
    profile.role === 'siswa'
      ? 'Siswa'
      : profile.role === 'teknisi'
        ? 'Teknisi'
        : 'Guru';
  const availableBorrowerRoles: PersonRole[] = isGuruAccount ? ['Guru'] : PERSON_ROLES;

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('ALL');
  const [periodFilter, setPeriodFilter] = useState<'ALL' | 'TODAY' | 'MONTH'>('ALL');

  // Create / Requester Edit Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingLoan, setEditingLoan] = useState<Loan | null>(null);
  const [assetId, setAssetId] = useState('');
  const [borrowerName, setBorrowerName] = useState(profile.displayName);
  const [borrowerRole, setBorrowerRole] = useState<PersonRole>(defaultBorrowerRole);
  const [unit, setUnit] = useState(profile.unit || 'Lab Komputer');
  const [borrowDate, setBorrowDate] = useState(today);
  const [returnDate, setReturnDate] = useState(today);
  const [lessonPeriod, setLessonPeriod] = useState(LESSON_PERIOD_OPTIONS[0].value);
  const [borrowTime, setBorrowTime] = useState(LESSON_PERIOD_OPTIONS[0].startTime);
  const [returnTime, setReturnTime] = useState(LESSON_PERIOD_OPTIONS[0].endTime);
  const [purpose, setPurpose] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Admin Review / Notes Modal
  const [reviewLoan, setReviewLoan] = useState<Loan | null>(null);
  const [reviewStatus, setReviewStatus] = useState<LoanStatus>('Disetujui');
  const [reviewReturnDate, setReviewReturnDate] = useState('');
  const [reviewNotes, setReviewNotes] = useState('');
  const [reviewSaving, setReviewSaving] = useState(false);

  // Admin Inline Rejection Note Drafts (in table column)
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [savingNoteId, setSavingNoteId] = useState<string | null>(null);

  // Printable Receipt Modal & Barcode Modal
  const [receiptLoan, setReceiptLoan] = useState<Loan | null>(null);
  const [barcodeLoan, setBarcodeLoan] = useState<Loan | null>(null);
  const [copiedBarcodeId, setCopiedBarcodeId] = useState<string | null>(null);
  const barcodeCardRef = useRef<HTMLDivElement | null>(null);

  const activeReceiptLoan = useMemo(() => {
    if (!receiptLoan) return null;
    return loans.find((l) => l.id === receiptLoan.id) ?? receiptLoan;
  }, [loans, receiptLoan]);

  const activeBarcodeLoan = useMemo(() => {
    if (!barcodeLoan) return null;
    return loans.find((l) => l.id === barcodeLoan.id) ?? barcodeLoan;
  }, [loans, barcodeLoan]);

  const handleCopyBarcodeCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedBarcodeId(code);
      onNotify('Kode barcode peminjaman disalin ke clipboard.');
      setTimeout(() => {
        setCopiedBarcodeId((prev) => (prev === code ? null : prev));
      }, 2000);
    } catch {
      onNotify('Gagal menyalin kode ke clipboard.', 'error');
    }
  };

  const stats = useMemo(() => {
    const waiting = loans.filter((l) => l.status === 'Menunggu').length;
    const approved = loans.filter((l) => l.status === 'Disetujui').length;
    const borrowed = loans.filter((l) => l.status === 'Dipinjam').length;
    const overdue = loans.filter(
      (l) => l.status === 'Dipinjam' && l.returnDate && l.returnDate < today
    ).length;
    const returned = loans.filter((l) => l.status === 'Dikembalikan').length;
    const rejected = loans.filter((l) => l.status === 'Ditolak').length;
    return { waiting, approved, borrowed, overdue, returned, rejected };
  }, [loans, today]);

  const filteredLoans = useMemo(() => {
    const q = search.trim().toLowerCase();
    return loans.filter((l) => {
      const isOverdue = l.status === 'Dipinjam' && l.returnDate && l.returnDate < today;
      if (statusFilter === 'OVERDUE' && !isOverdue) return false;
      if (statusFilter !== 'ALL' && statusFilter !== 'OVERDUE' && l.status !== statusFilter) {
        return false;
      }
      if (periodFilter === 'TODAY' && l.borrowDate !== today) return false;
      if (periodFilter === 'MONTH' && !l.borrowDate.startsWith(currentMonth)) return false;

      if (!q) return true;
      return (
        l.assetName.toLowerCase().includes(q) ||
        l.assetCode.toLowerCase().includes(q) ||
        l.borrowerName.toLowerCase().includes(q) ||
        l.unit.toLowerCase().includes(q) ||
        l.purpose.toLowerCase().includes(q) ||
        l.notes.toLowerCase().includes(q)
      );
    });
  }, [loans, search, statusFilter, periodFilter, today, currentMonth]);

  const selectedAsset = useMemo(
    () => assets.find((a) => a.id === assetId) ?? null,
    [assets, assetId]
  );

  const lockedAssetInfoMap = useMemo(() => {
    const map = new Map<
      string,
      {
        loanId: string;
        status: 'Disetujui' | 'Dipinjam';
        borrowerName?: string;
        borrowDate?: string;
        returnDate?: string;
      }
    >();
    for (const lock of assetLocks) {
      map.set(lock.assetId, {
        loanId: lock.loanId,
        status: lock.status,
      });
    }
    for (const l of loans) {
      if (l.status === 'Disetujui' || l.status === 'Dipinjam') {
        const prev = map.get(l.assetId);
        if (!prev || prev.loanId === l.id || l.status === 'Dipinjam') {
          map.set(l.assetId, {
            loanId: l.id,
            status: l.status,
            borrowerName: l.borrowerName,
            borrowDate: l.borrowDate,
            returnDate: l.returnDate,
          });
        }
      }
    }
    return map;
  }, [assetLocks, loans]);

  const selectedAssetLock = useMemo(() => {
    if (editingLoan || !assetId) return null;
    return lockedAssetInfoMap.get(assetId) ?? null;
  }, [editingLoan, assetId, lockedAssetInfoMap]);

  const allAssetsLocked = useMemo(
    () => assets.length > 0 && assets.every((a) => lockedAssetInfoMap.has(a.id)),
    [assets, lockedAssetInfoMap]
  );

  const conflictingLoans = useMemo(() => {
    if (!assetId || !borrowDate || !returnDate) return [];
    return loans.filter((l) => {
      if (editingLoan && l.id === editingLoan.id) return false;
      if (l.assetId !== assetId) return false;
      if (l.status !== 'Disetujui' && l.status !== 'Dipinjam') return false;
      return datesOverlap(borrowDate, returnDate, l.borrowDate, l.returnDate);
    });
  }, [loans, assetId, borrowDate, returnDate, editingLoan]);

  const openCreate = () => {
    setEditingLoan(null);
    const preferredAsset =
      assets.find((a) => !lockedAssetInfoMap.has(a.id) && a.condition === 'Baik') ??
      assets.find((a) => !lockedAssetInfoMap.has(a.id)) ??
      null;
    setAssetId(preferredAsset?.id ?? '');
    setBorrowerName(profile.displayName);
    setBorrowerRole(defaultBorrowerRole);
    setUnit(profile.unit || 'Lab Komputer');
    setBorrowDate(today);
    setReturnDate(today);
    setLessonPeriod(LESSON_PERIOD_OPTIONS[0].value);
    setBorrowTime(LESSON_PERIOD_OPTIONS[0].startTime);
    setReturnTime(LESSON_PERIOD_OPTIONS[0].endTime);
    setPurpose('');
    setNotes('');
    setModalOpen(true);
  };

  const openEditPending = (loan: Loan) => {
    setEditingLoan(loan);
    setAssetId(loan.assetId);
    setBorrowerName(loan.borrowerName);
    setBorrowerRole(loan.borrowerRole);
    setUnit(loan.unit);
    setBorrowDate(loan.borrowDate);
    setReturnDate(loan.returnDate);
    setLessonPeriod(loan.lessonPeriod || LESSON_PERIOD_OPTIONS[0].value);
    setBorrowTime(loan.borrowTime || LESSON_PERIOD_OPTIONS[0].startTime);
    setReturnTime(loan.returnTime || LESSON_PERIOD_OPTIONS[0].endTime);
    setPurpose(loan.purpose);
    setNotes(loan.notes || '');
    setModalOpen(true);
  };

  const openReviewModal = (loan: Loan, presetStatus?: LoanStatus) => {
    const nextStatus = presetStatus ?? loan.status;
    setReviewLoan(loan);
    setReviewStatus(nextStatus);
    setReviewReturnDate(loan.returnDate);
    setReviewNotes(
      presetStatus === 'Ditolak' && loan.status !== 'Ditolak' ? '' : loan.notes || ''
    );
  };

  const handleLessonPeriodChange = (value: string) => {
    setLessonPeriod(value);
    const matched = LESSON_PERIOD_OPTIONS.find((opt) => opt.value === value);
    if (matched) {
      setBorrowTime(matched.startTime);
      setReturnTime(matched.endTime);
    }
  };

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLoan) {
      if (!assetId) {
        onNotify('Tidak ada perangkat yang tersedia untuk dipinjam saat ini.', 'error');
        return;
      }
      if (lockedAssetInfoMap.has(assetId)) {
        onNotify(
          'Perangkat ini sudah disetujui atau sedang dipinjam oleh pengguna lain dan belum dikembalikan.',
          'error'
        );
        return;
      }
    }
    if (returnDate < borrowDate) {
      onNotify('Tanggal kembali tidak boleh lebih awal dari tanggal pinjam.', 'error');
      return;
    }
    setSaving(true);
    try {
      if (editingLoan) {
        await apiFetch(`/api/loans/${editingLoan.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            borrowDate,
            returnDate,
            lessonPeriod,
            borrowTime,
            returnTime,
            purpose,
            notes,
          }),
        });
        onNotify('Pengajuan peminjaman berhasil diperbarui.');
      } else {
        await apiFetch('/api/loans', {
          method: 'POST',
          body: JSON.stringify({
            assetId,
            borrowerName,
            borrowerRole: isGuruAccount ? 'Guru' : borrowerRole,
            unit,
            borrowDate,
            returnDate,
            lessonPeriod,
            borrowTime,
            returnTime,
            purpose,
            notes,
          }),
        });
        onNotify('Pengajuan peminjaman berhasil dikirim.');
      }
      setModalOpen(false);
      await onRefresh();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Gagal menyimpan peminjaman.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (loan: Loan, status: LoanStatus) => {
    if (status === 'Ditolak') {
      openReviewModal(loan, 'Ditolak');
      return;
    }
    try {
      await apiFetch(`/api/loans/${loan.id}`, {
        method: 'PUT',
        body: JSON.stringify({ status }),
      });
      onNotify(`Status peminjaman diubah ke ${status}.`);
      await onRefresh();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Gagal memperbarui status.', 'error');
    }
  };

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewLoan) return;
    if (reviewStatus === 'Ditolak' && !reviewNotes.trim()) {
      onNotify('Harap isi kolom catatan alasan penolakan.', 'error');
      return;
    }
    setReviewSaving(true);
    try {
      await apiFetch(`/api/loans/${reviewLoan.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          status: reviewStatus,
          returnDate: reviewReturnDate,
          notes: reviewNotes.trim(),
        }),
      });
      onNotify(`Status peminjaman diperbarui menjadi ${reviewStatus}.`);
      setReviewLoan(null);
      await onRefresh();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Gagal memproses peminjaman.', 'error');
    } finally {
      setReviewSaving(false);
    }
  };

  const handleSaveInlineNote = async (loan: Loan) => {
    const draft = (noteDrafts[loan.id] ?? loan.notes ?? '').trim();
    if (loan.status === 'Ditolak' && !draft) {
      onNotify('Harap tulis catatan alasan penolakan terlebih dahulu.', 'error');
      return;
    }
    setSavingNoteId(loan.id);
    try {
      await apiFetch(`/api/loans/${loan.id}`, {
        method: 'PUT',
        body: JSON.stringify({ notes: draft }),
      });
      setNoteDrafts((prev) => {
        const next = { ...prev };
        delete next[loan.id];
        return next;
      });
      onNotify('Catatan penolakan berhasil disimpan.');
      await onRefresh();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Gagal menyimpan catatan.', 'error');
    } finally {
      setSavingNoteId(null);
    }
  };

  const handleDelete = async (loan: Loan) => {
    try {
      await apiFetch(`/api/loans/${loan.id}`, { method: 'DELETE' });
      onNotify('Data peminjaman dihapus.');
      await onRefresh();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Gagal menghapus peminjaman.', 'error');
    }
  };

  const filterTabs: Array<{ key: FilterStatus; label: string; count: number }> = [
    { key: 'ALL', label: 'Semua', count: loans.length },
    { key: 'Menunggu', label: 'Menunggu', count: stats.waiting },
    { key: 'Disetujui', label: 'Disetujui', count: stats.approved },
    { key: 'Dipinjam', label: 'Dipinjam', count: stats.borrowed },
    { key: 'OVERDUE', label: 'Terlambat', count: stats.overdue },
    { key: 'Dikembalikan', label: 'Dikembalikan', count: stats.returned },
    { key: 'Ditolak', label: 'Ditolak', count: stats.rejected },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Peminjaman Perangkat</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Ajukan peminjaman, pantau jatuh tempo pengembalian, dan cetak bukti serah terima.
          </p>
        </div>
        <button
          type="button"
          disabled={assets.length === 0}
          onClick={openCreate}
          className="px-4 py-2.5 rounded-xl bg-[#2563eb] hover:bg-[#1d4ed8] disabled:opacity-50 text-white text-sm font-semibold inline-flex items-center gap-1.5 cursor-pointer self-start sm:self-auto shadow-xs"
        >
          <Plus className="w-4 h-4" />
          Ajukan Peminjaman
        </button>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white rounded-2xl border border-slate-200/90 px-4 py-3.5">
          <div className="text-xs text-slate-500">Menunggu Persetujuan</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-amber-600 mt-0.5">
            {stats.waiting}
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200/90 px-4 py-3.5">
          <div className="text-xs text-slate-500">Siap Diambil (Disetujui)</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-sky-600 mt-0.5">
            {stats.approved}
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200/90 px-4 py-3.5">
          <div className="text-xs text-slate-500">Sedang Dipinjam</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-indigo-600 mt-0.5">
            {stats.borrowed}
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200/90 px-4 py-3.5">
          <div className="text-xs text-slate-500">Terlambat Kembali</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-rose-600 mt-0.5">
            {stats.overdue}
          </div>
        </div>
      </div>

      {assets.length === 0 && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
          Belum ada aset di inventaris. Tambahkan aset terlebih dahulu sebelum mengajukan peminjaman.
        </div>
      )}

      {/* Search & Filter Bar */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari perangkat, peminjam, kelas..."
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-white border border-slate-200 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#2563eb]"
            />
          </div>
          <select
            value={periodFilter}
            onChange={(e) => setPeriodFilter(e.target.value as typeof periodFilter)}
            className="px-3.5 py-2 rounded-xl border border-slate-200 text-sm text-slate-700 bg-white focus:outline-none focus:border-[#2563eb]"
          >
            <option value="ALL">Semua tanggal</option>
            <option value="TODAY">Pinjam hari ini</option>
            <option value="MONTH">Bulan ini</option>
          </select>
        </div>

        {/* Interactive Status Segmented Filter */}
        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-200/60 rounded-xl w-fit max-w-full overflow-x-auto">
          {filterTabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setStatusFilter(t.key)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                statusFilter === t.key
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t.label} ({t.count})
            </button>
          ))}
        </div>
      </div>

      {/* Loans Table */}
      <div className="bg-white rounded-2xl border border-slate-200/90 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Perangkat</th>
                <th className="px-4 py-3 font-semibold">Peminjam</th>
                <th className="px-4 py-3 font-semibold">Tanggal & Jam</th>
                <th className="px-4 py-3 font-semibold">Keperluan</th>
                <th className="px-4 py-3 font-semibold">Catatan</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredLoans.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                    {loans.length === 0
                      ? 'Belum ada data peminjaman.'
                      : 'Tidak ada data peminjaman yang sesuai dengan filter.'}
                  </td>
                </tr>
              ) : (
                filteredLoans.map((loan) => {
                  const isRequesterPending =
                    loan.requesterId === profile.uid && loan.status === 'Menunggu';
                  const canDelete = isAdmin || isRequesterPending;
                  const daysLate =
                    loan.status === 'Dipinjam' && loan.returnDate && loan.returnDate < today
                      ? diffDays(loan.returnDate, today)
                      : 0;

                  return (
                    <tr key={loan.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900">{loan.assetName}</div>
                        <div className="font-mono text-xs text-slate-500">{loan.assetCode}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-800">{loan.borrowerName}</div>
                        <div className="text-xs text-slate-500">
                          {loan.borrowerRole} · {loan.unit}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">
                        <div>
                          {loan.borrowDate} → {loan.returnDate}
                        </div>
                        {(loan.lessonPeriod || loan.borrowTime || loan.returnTime) && (
                          <div className="text-[11px] text-slate-500 mt-0.5 font-sans">
                            {[
                              loan.lessonPeriod,
                              loan.borrowTime && loan.returnTime
                                ? `${loan.borrowTime} - ${loan.returnTime}`
                                : loan.borrowTime || loan.returnTime,
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </div>
                        )}
                        {daysLate > 0 && (
                          <div className="text-[11px] font-sans font-semibold text-rose-600 mt-0.5">
                            Terlambat {daysLate} hari
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-700 max-w-[220px]">
                        <div className="line-clamp-2">{loan.purpose}</div>
                      </td>
                      <td className="px-4 py-3 min-w-[230px] max-w-[280px]">
                        {loan.status === 'Ditolak' ? (
                          isAdmin ? (
                            <div className="space-y-1.5">
                              <textarea
                                rows={2}
                                maxLength={240}
                                value={
                                  noteDrafts[loan.id] !== undefined
                                    ? noteDrafts[loan.id]
                                    : loan.notes
                                }
                                onChange={(e) =>
                                  setNoteDrafts((prev) => ({
                                    ...prev,
                                    [loan.id]: e.target.value,
                                  }))
                                }
                                placeholder="Tulis alasan penolakan..."
                                className="w-full px-2.5 py-1.5 rounded-lg border border-rose-300 bg-rose-50/40 text-xs text-slate-800 placeholder-rose-400 focus:outline-none focus:border-rose-500 resize-none"
                              />
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[10px] text-rose-600 font-medium">
                                  {(noteDrafts[loan.id] ?? loan.notes).trim()
                                    ? noteDrafts[loan.id] !== undefined &&
                                      noteDrafts[loan.id].trim() !== (loan.notes || '').trim()
                                      ? 'Belum disimpan'
                                      : 'Catatan tersimpan'
                                    : 'Belum ada alasan penolakan'}
                                </span>
                                <button
                                  type="button"
                                  disabled={
                                    savingNoteId === loan.id ||
                                    (noteDrafts[loan.id] ?? loan.notes).trim() ===
                                      (loan.notes || '').trim()
                                  }
                                  onClick={() => handleSaveInlineNote(loan)}
                                  className="px-2.5 py-1 rounded-md bg-rose-600 hover:bg-rose-700 disabled:opacity-45 text-white text-[11px] font-semibold cursor-pointer"
                                >
                                  {savingNoteId === loan.id ? 'Menyimpan...' : 'Simpan'}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="rounded-lg bg-rose-50 border border-rose-200 px-2.5 py-1.5 text-xs text-rose-700">
                              <span className="font-semibold">Alasan Ditolak: </span>
                              <span>{loan.notes || 'Tidak ada catatan penolakan.'}</span>
                            </div>
                          )
                        ) : loan.notes ? (
                          <div className="text-xs text-slate-600 line-clamp-2">{loan.notes}</div>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isAdmin ? (
                          <select
                            value={loan.status}
                            onChange={(e) =>
                              handleStatusChange(loan, e.target.value as LoanStatus)
                            }
                            className="px-2.5 py-1 rounded-lg border border-slate-200 text-xs font-medium bg-white"
                          >
                            {LOAN_STATUSES.map((st) => (
                              <option key={st} value={st}>
                                {st}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span
                            className={`text-xs font-semibold ${
                              daysLate > 0 || loan.status === 'Ditolak'
                                ? 'text-rose-600'
                                : loan.status === 'Dikembalikan'
                                  ? 'text-emerald-700'
                                  : loan.status === 'Dipinjam'
                                    ? 'text-indigo-700'
                                    : loan.status === 'Disetujui'
                                      ? 'text-sky-700'
                                      : 'text-amber-700'
                            }`}
                          >
                            {daysLate > 0 ? 'Terlambat' : loan.status}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          {isAdmin && loan.status === 'Menunggu' && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleStatusChange(loan, 'Disetujui')}
                                title="Setujui Cepat"
                                className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 cursor-pointer"
                              >
                                <Check className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => openReviewModal(loan, 'Ditolak')}
                                title="Tolak dengan Catatan"
                                className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 cursor-pointer"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </>
                          )}
                          {isAdmin && loan.status === 'Disetujui' && (
                            <button
                              type="button"
                              onClick={() => handleStatusChange(loan, 'Dipinjam')}
                              className="px-2 py-1 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 text-xs font-semibold cursor-pointer"
                            >
                              Serahkan
                            </button>
                          )}
                          {isAdmin && loan.status === 'Dipinjam' && (
                            <button
                              type="button"
                              onClick={() => handleStatusChange(loan, 'Dikembalikan')}
                              className="px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 text-xs font-semibold cursor-pointer"
                            >
                              Kembali
                            </button>
                          )}
                          {isAdmin && (
                            <button
                              type="button"
                              onClick={() => openReviewModal(loan)}
                              title="Proses / Catatan Admin"
                              className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 cursor-pointer"
                            >
                              <FileCheck2 className="w-4 h-4" />
                            </button>
                          )}
                          {!isAdmin && isRequesterPending && (
                            <button
                              type="button"
                              onClick={() => openEditPending(loan)}
                              title="Ubah Pengajuan"
                              className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 cursor-pointer"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                          )}
                          {isAdmin && isApprovedLoanStatus(loan.status) && (
                            <button
                              type="button"
                              onClick={() => setBarcodeLoan(loan)}
                              title="Tampilkan Barcode Peminjaman untuk Discan Peminjam"
                              className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                            >
                              <ScanBarcode className="w-3.5 h-3.5" />
                              Barcode
                            </button>
                          )}
                          {loan.status !== 'Ditolak' && (
                            <button
                              type="button"
                              onClick={() => setReceiptLoan(loan)}
                              title="Cetak Bukti Peminjaman"
                              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 cursor-pointer"
                            >
                              <Printer className="w-4 h-4" />
                            </button>
                          )}
                          {canDelete && (
                            <button
                              type="button"
                              onClick={() => handleDelete(loan)}
                              title="Hapus"
                              className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
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

      {/* Create / Edit Pending Loan Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-lg overflow-hidden max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h3 className="font-bold text-slate-900">
                {editingLoan ? 'Ubah Pengajuan Peminjaman' : 'Ajukan Peminjaman Aset'}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmitForm} className="p-5 space-y-4 overflow-y-auto">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Pilih Perangkat *
                </label>
                <select
                  required
                  disabled={Boolean(editingLoan)}
                  value={assetId}
                  onChange={(e) => setAssetId(e.target.value)}
                  className={`w-full px-3 py-2 rounded-xl border border-slate-200 text-sm ${
                    editingLoan ? 'bg-slate-50 text-slate-600' : 'bg-white'
                  }`}
                >
                  {!editingLoan && !assetId && (
                    <option value="">-- Tidak ada perangkat tersedia --</option>
                  )}
                  {assets.map((a) => {
                    const lockInfo = lockedAssetInfoMap.get(a.id);
                    const isLocked = !editingLoan && Boolean(lockInfo);
                    return (
                      <option key={a.id} value={a.id} disabled={isLocked}>
                        [{a.code}] {a.name} ({a.condition})
                        {lockInfo
                          ? ` — [${lockInfo.status === 'Dipinjam' ? 'Sedang Dipinjam' : 'Sudah Disetujui'} · Tidak Tersedia]`
                          : ''}
                      </option>
                    );
                  })}
                  {editingLoan && !assets.some((a) => a.id === editingLoan.assetId) && (
                    <option value={editingLoan.assetId}>
                      [{editingLoan.assetCode}] {editingLoan.assetName}
                    </option>
                  )}
                </select>

                {!editingLoan && allAssetsLocked && (
                  <div className="mt-2 rounded-xl bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-700 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>
                      Semua perangkat inventaris saat ini sudah disetujui admin atau sedang
                      dipinjam sehingga belum dapat diajukan.
                    </span>
                  </div>
                )}

                {selectedAssetLock && (
                  <div className="mt-2 rounded-xl bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-700 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>
                      Perangkat ini{' '}
                      <strong>
                        {selectedAssetLock.status === 'Dipinjam'
                          ? 'sedang dipinjam'
                          : 'sudah disetujui oleh admin'}
                      </strong>
                      {selectedAssetLock.borrowerName
                        ? ` (${selectedAssetLock.borrowerName})`
                        : ''}
                      {selectedAssetLock.borrowDate && selectedAssetLock.returnDate
                        ? ` pada ${selectedAssetLock.borrowDate} → ${selectedAssetLock.returnDate}`
                        : ''}
                      , sehingga tidak dapat dipinjam oleh pengguna lain hingga dikembalikan.
                    </span>
                  </div>
                )}

                {selectedAsset && selectedAsset.condition !== 'Baik' && (
                  <div className="mt-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>
                      Perangkat ini berstatus <strong>{selectedAsset.condition}</strong>. Pastikan
                      kelayakan sebelum digunakan.
                    </span>
                  </div>
                )}

                {!selectedAssetLock && conflictingLoans.length > 0 && (
                  <div className="mt-2 rounded-xl bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-700 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>
                      Peringatan bentrok: perangkat ini sudah disetujui/dipinjam oleh{' '}
                      <strong>{conflictingLoans[0].borrowerName}</strong> (
                      {conflictingLoans[0].borrowDate} → {conflictingLoans[0].returnDate}).
                    </span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Nama Peminjam *
                  </label>
                  <input
                    type="text"
                    required
                    disabled={Boolean(editingLoan)}
                    value={borrowerName}
                    onChange={(e) => setBorrowerName(e.target.value)}
                    className={`w-full px-3 py-2 rounded-xl border border-slate-200 text-sm ${
                      editingLoan ? 'bg-slate-50 text-slate-600' : ''
                    }`}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Status Peminjam *
                  </label>
                  <select
                    value={isGuruAccount ? 'Guru' : borrowerRole}
                    disabled={isGuruAccount || Boolean(editingLoan)}
                    onChange={(e) => setBorrowerRole(e.target.value as PersonRole)}
                    className={`w-full px-3 py-2 rounded-xl border border-slate-200 text-sm ${
                      isGuruAccount || editingLoan
                        ? 'bg-slate-50 text-slate-700 cursor-not-allowed'
                        : 'bg-white'
                    }`}
                  >
                    {availableBorrowerRoles.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Kelas / Unit *
                  </label>
                  <input
                    type="text"
                    required
                    disabled={Boolean(editingLoan)}
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    className={`w-full px-3 py-2 rounded-xl border border-slate-200 text-sm ${
                      editingLoan ? 'bg-slate-50 text-slate-600' : ''
                    }`}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Pinjam *
                    </label>
                    <input
                      type="date"
                      required
                      value={borrowDate}
                      onChange={(e) => setBorrowDate(e.target.value)}
                      className="w-full px-2.5 py-2 rounded-xl border border-slate-200 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Kembali *
                    </label>
                    <input
                      type="date"
                      required
                      value={returnDate}
                      onChange={(e) => setReturnDate(e.target.value)}
                      className="w-full px-2.5 py-2 rounded-xl border border-slate-200 text-xs"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Jam ke- *
                  </label>
                  <select
                    required
                    value={lessonPeriod}
                    onChange={(e) => handleLessonPeriodChange(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white"
                  >
                    {LESSON_PERIOD_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Waktu Mulai *
                  </label>
                  <input
                    type="time"
                    required
                    value={borrowTime}
                    onChange={(e) => setBorrowTime(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Waktu Selesai *
                  </label>
                  <input
                    type="time"
                    required
                    value={returnTime}
                    onChange={(e) => setReturnTime(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Keperluan Peminjaman *
                </label>
                <input
                  type="text"
                  required
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  placeholder="cth. Praktikum Jaringan Kelas XI TKJ"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Catatan Tambahan
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
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
                  disabled={saving || Boolean(selectedAssetLock) || (!editingLoan && !assetId)}
                  className="px-4 py-2 rounded-xl text-sm font-semibold bg-[#2563eb] hover:bg-[#1d4ed8] disabled:opacity-60 text-white cursor-pointer"
                >
                  {saving
                    ? 'Menyimpan...'
                    : editingLoan
                      ? 'Simpan Perubahan'
                      : 'Kirim Pengajuan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Admin Process & Notes Modal */}
      {reviewLoan && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-900">Proses Peminjaman</h3>
                <p className="text-xs text-slate-500">
                  {reviewLoan.assetName} · {reviewLoan.borrowerName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReviewLoan(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleReviewSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Status Peminjaman *
                </label>
                <select
                  value={reviewStatus}
                  onChange={(e) => setReviewStatus(e.target.value as LoanStatus)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white"
                >
                  {LOAN_STATUSES.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Batas Tanggal Kembali *
                </label>
                <input
                  type="date"
                  required
                  value={reviewReturnDate}
                  onChange={(e) => setReviewReturnDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label
                    className={`block text-xs font-medium ${
                      reviewStatus === 'Ditolak' ? 'text-rose-700 font-semibold' : 'text-slate-700'
                    }`}
                  >
                    {reviewStatus === 'Ditolak'
                      ? 'Catatan Alasan Penolakan *'
                      : 'Catatan Admin / Kondisi Serah Terima'}
                  </label>
                  <span className="text-[11px] font-mono text-slate-400">
                    {reviewNotes.length}/240
                  </span>
                </div>
                <textarea
                  rows={3}
                  maxLength={240}
                  required={reviewStatus === 'Ditolak'}
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  placeholder={
                    reviewStatus === 'Ditolak'
                      ? 'Tuliskan alasan penolakan agar peminjam mengetahui penyebabnya...'
                      : 'cth. Diserahkan lengkap beserta kabel HDMI'
                  }
                  className={`w-full px-3 py-2 rounded-xl border text-sm focus:outline-none ${
                    reviewStatus === 'Ditolak'
                      ? 'border-rose-300 bg-rose-50/40 focus:border-rose-500'
                      : 'border-slate-200 focus:border-[#2563eb]'
                  }`}
                />
                {reviewStatus === 'Ditolak' && (
                  <p className="mt-1 text-[11px] text-rose-600">
                    Wajib diisi saat menolak pengajuan peminjaman.
                  </p>
                )}
              </div>
              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setReviewLoan(null)}
                  className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={reviewSaving}
                  className={`px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-60 text-white cursor-pointer ${
                    reviewStatus === 'Ditolak'
                      ? 'bg-rose-600 hover:bg-rose-700'
                      : 'bg-[#2563eb] hover:bg-[#1d4ed8]'
                  }`}
                >
                  {reviewSaving
                    ? 'Menyimpan...'
                    : reviewStatus === 'Ditolak'
                      ? 'Tolak Peminjaman'
                      : 'Simpan Keputusan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Printable Surat Bukti Peminjaman Modal */}
      {activeReceiptLoan && activeReceiptLoan.status !== 'Ditolak' && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-xl overflow-hidden flex flex-col max-h-[92vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h3 className="font-bold text-slate-900">Bukti Peminjaman Perangkat</h3>
              <button
                type="button"
                onClick={() => setReceiptLoan(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto">
              <div data-print-root="true" className="bg-white text-slate-900 space-y-5">
                {/* Letterhead */}
                <div className="flex items-center gap-3.5 pb-4 border-b-2 border-slate-800">
                  {branding.logoDataUrl && (
                    <img
                      src={branding.logoDataUrl}
                      alt={branding.appName}
                      className="w-14 h-14 object-contain shrink-0"
                    />
                  )}
                  <div>
                    <div className="text-base font-extrabold uppercase tracking-tight">
                      {branding.appName}
                    </div>
                    <div className="text-xs text-slate-600">{branding.appSubtitle}</div>
                    <div className="text-xs font-semibold text-slate-800">
                      {branding.schoolName}
                    </div>
                  </div>
                </div>

                <div className="text-center">
                  <h4 className="text-sm font-bold uppercase tracking-wide underline">
                    SURAT BUKTI PEMINJAMAN PERANGKAT
                  </h4>
                  {isAdmin && (
                    <p className="text-xs font-mono text-slate-500 mt-0.5">
                      No. Ref: {getLoanRefCode(activeReceiptLoan.id)}
                    </p>
                  )}
                </div>

                <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-xs border border-slate-200 rounded-xl p-4">
                  <div>
                    <dt className="text-slate-500">Kode & Nama Aset</dt>
                    <dd className="font-semibold text-slate-900 mt-0.5">
                      [{activeReceiptLoan.assetCode}] {activeReceiptLoan.assetName}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Status</dt>
                    <dd className="font-semibold text-slate-900 mt-0.5">
                      {activeReceiptLoan.status}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Nama Peminjam</dt>
                    <dd className="font-semibold text-slate-900 mt-0.5">
                      {activeReceiptLoan.borrowerName} ({activeReceiptLoan.borrowerRole})
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Kelas / Unit</dt>
                    <dd className="font-semibold text-slate-900 mt-0.5">
                      {activeReceiptLoan.unit}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Tanggal Pinjam – Kembali</dt>
                    <dd className="font-mono font-semibold text-slate-900 mt-0.5">
                      {activeReceiptLoan.borrowDate} s.d. {activeReceiptLoan.returnDate}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Jam Pelajaran & Waktu</dt>
                    <dd className="font-semibold text-slate-900 mt-0.5">
                      {[
                        activeReceiptLoan.lessonPeriod,
                        activeReceiptLoan.borrowTime && activeReceiptLoan.returnTime
                          ? `${activeReceiptLoan.borrowTime} - ${activeReceiptLoan.returnTime}`
                          : '',
                      ]
                        .filter(Boolean)
                        .join(' · ') || '—'}
                    </dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-slate-500">Keperluan</dt>
                    <dd className="font-medium text-slate-900 mt-0.5">
                      {activeReceiptLoan.purpose}
                    </dd>
                  </div>
                  {activeReceiptLoan.notes && (
                    <div className="col-span-2">
                      <dt className="text-slate-500">Catatan</dt>
                      <dd className="font-medium text-slate-900 mt-0.5">
                        {activeReceiptLoan.notes}
                      </dd>
                    </div>
                  )}
                </dl>

                {isApprovedLoanStatus(activeReceiptLoan.status) ? (
                  isAdmin ? (
                    <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-4">
                      <div className="flex flex-col items-center sm:items-start text-center sm:text-left">
                        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                          Barcode Peminjaman Admin (Scan Saat Pengembalian)
                        </div>
                        <div className="bg-white border border-slate-200 rounded-lg px-2 py-1">
                          <LoanBarcodeSvg
                            value={activeReceiptLoan.id}
                            height={42}
                            width={1.4}
                            fontSize={10}
                          />
                        </div>
                        <div className="text-[11px] font-mono text-slate-500 mt-1">
                          Ref: {getLoanRefCode(activeReceiptLoan.id)} · Aset:{' '}
                          {activeReceiptLoan.assetCode}
                        </div>
                      </div>
                      <div className="p-2 bg-white border border-slate-200 rounded-lg shrink-0">
                        <QRCodeSVG
                          value={buildLoanQrPayload(activeReceiptLoan)}
                          size={86}
                          level="M"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs text-emerald-800 text-center">
                      Disetujui Admin — Saat pengembalian, silakan scan Barcode Peminjaman yang
                      ditunjukkan oleh Admin Lab melalui menu <strong>Pengembalian</strong>.
                    </div>
                  )
                ) : (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-800 text-center">
                    Menunggu persetujuan admin — barcode peminjaman akan tersedia di akun Admin
                    setelah disetujui.
                  </div>
                )}

                <div className="grid grid-cols-2 gap-6 pt-4 text-center text-xs">
                  <div>
                    <div className="text-slate-500">Peminjam,</div>
                    <div className="h-14" />
                    <div className="font-semibold underline">{activeReceiptLoan.borrowerName}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">Petugas / Teknisi Lab,</div>
                    <div className="h-14" />
                    <div className="font-semibold underline">( ______________________ )</div>
                  </div>
                </div>
              </div>
            </div>
            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setReceiptLoan(null)}
                className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-200/70 cursor-pointer"
              >
                Tutup
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="px-4 py-2 rounded-xl text-sm font-semibold bg-[#2563eb] hover:bg-[#1d4ed8] text-white inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                Cetak / PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Barcode Peminjaman Modal (Admin-only display for borrowers to scan) */}
      {isAdmin && activeBarcodeLoan && isApprovedLoanStatus(activeBarcodeLoan.status) && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[92vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-900">Barcode Peminjaman</h3>
                <p className="text-xs text-slate-500">
                  Sinkron dengan menu Pengembalian — scan barcode/QR ini saat mengembalikan
                </p>
              </div>
              <button
                type="button"
                onClick={() => setBarcodeLoan(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto">
              <div
                ref={barcodeCardRef}
                data-print-root="true"
                className="bg-white text-slate-900 space-y-4 text-center"
              >
                <div className="pb-3 border-b border-slate-200">
                  <div className="text-xs font-extrabold uppercase tracking-wide text-slate-800">
                    {branding.appName} — {branding.schoolName}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Kartu Barcode Peminjaman · No. Ref: {getLoanRefCode(activeBarcodeLoan.id)}
                  </div>
                </div>

                <div className="inline-flex flex-col items-center p-3.5 bg-white border border-slate-200 rounded-xl">
                  <QRCodeSVG
                    value={buildLoanQrPayload(activeBarcodeLoan)}
                    size={156}
                    level="M"
                    includeMargin
                  />
                </div>

                <div className="flex flex-col items-center gap-2">
                  <div className="px-3 py-2 bg-white border border-slate-200 rounded-xl max-w-full overflow-x-auto">
                    <LoanBarcodeSvg
                      value={activeBarcodeLoan.id}
                      height={54}
                      width={1.6}
                      fontSize={11}
                    />
                  </div>
                  <div className="inline-flex items-center gap-2 text-xs font-mono text-slate-600 bg-slate-100 px-3 py-1.5 rounded-lg">
                    <span>{activeBarcodeLoan.id}</span>
                    <button
                      type="button"
                      onClick={() => void handleCopyBarcodeCode(activeBarcodeLoan.id)}
                      className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 font-sans font-semibold cursor-pointer"
                      title="Salin kode barcode"
                    >
                      {copiedBarcodeId === activeBarcodeLoan.id ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          <span className="text-emerald-600">Disalin</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Salin</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <dl className="grid grid-cols-2 gap-2.5 text-left text-xs bg-slate-50 rounded-xl p-3.5 border border-slate-100">
                  <div>
                    <dt className="text-slate-500">Perangkat</dt>
                    <dd className="font-semibold text-slate-900 mt-0.5">
                      [{activeBarcodeLoan.assetCode}] {activeBarcodeLoan.assetName}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Status</dt>
                    <dd className="font-semibold text-emerald-700 mt-0.5">
                      {activeBarcodeLoan.status}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Peminjam</dt>
                    <dd className="font-semibold text-slate-900 mt-0.5">
                      {activeBarcodeLoan.borrowerName} ({activeBarcodeLoan.unit})
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Tanggal</dt>
                    <dd className="font-mono font-semibold text-slate-900 mt-0.5">
                      {activeBarcodeLoan.borrowDate} → {activeBarcodeLoan.returnDate}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-100 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setBarcodeLoan(null)}
                className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-200/70 cursor-pointer"
              >
                Tutup
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await downloadLoanBarcodePng(
                      barcodeCardRef.current,
                      activeBarcodeLoan,
                      `${branding.appName} — ${branding.schoolName}`
                    );
                    onNotify('Gambar barcode PNG berhasil diunduh untuk dikirim ke peminjam.');
                  } catch (err) {
                    onNotify(
                      err instanceof Error ? err.message : 'Gagal mengunduh gambar barcode.',
                      'error'
                    );
                  }
                }}
                className="px-4 py-2 rounded-xl text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                Unduh Gambar PNG
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="px-4 py-2 rounded-xl text-sm font-semibold bg-[#2563eb] hover:bg-[#1d4ed8] text-white inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                Cetak Barcode
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
