import React, { useState } from 'react';
import { Plus, Trash2, Check, X } from 'lucide-react';
import { apiFetch } from '../lib/api';
import {
  LOAN_STATUSES,
  PERSON_ROLES,
  todayIsoDate,
  type Asset,
  type Loan,
  type LoanStatus,
  type PersonRole,
  type UserProfile,
} from '../types';

interface LoansTabProps {
  loans: Loan[];
  assets: Asset[];
  profile: UserProfile;
  isAdmin: boolean;
  onRefresh: () => Promise<void>;
  onNotify: (msg: string, type?: 'success' | 'error') => void;
}

export const LoansTab: React.FC<LoansTabProps> = ({
  loans,
  assets,
  profile,
  isAdmin,
  onRefresh,
  onNotify,
}) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [assetId, setAssetId] = useState('');
  const [borrowerName, setBorrowerName] = useState(profile.displayName);
  const [borrowerRole, setBorrowerRole] = useState<PersonRole>('Guru');
  const [unit, setUnit] = useState(profile.unit || 'Lab Komputer');
  const [borrowDate, setBorrowDate] = useState(todayIsoDate());
  const [returnDate, setReturnDate] = useState(todayIsoDate());
  const [purpose, setPurpose] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const openCreate = () => {
    setAssetId(assets[0]?.id ?? '');
    setBorrowerName(profile.displayName);
    setUnit(profile.unit || 'Lab Komputer');
    setBorrowDate(todayIsoDate());
    setReturnDate(todayIsoDate());
    setPurpose('');
    setNotes('');
    setModalOpen(true);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch('/api/loans', {
        method: 'POST',
        body: JSON.stringify({
          assetId,
          borrowerName,
          borrowerRole,
          unit,
          borrowDate,
          returnDate,
          purpose,
          notes,
        }),
      });
      onNotify('Pengajuan peminjaman berhasil dikirim.');
      setModalOpen(false);
      await onRefresh();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Gagal mengajukan peminjaman.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (loan: Loan, status: LoanStatus) => {
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

  const handleDelete = async (loan: Loan) => {
    try {
      await apiFetch(`/api/loans/${loan.id}`, { method: 'DELETE' });
      onNotify('Data peminjaman dihapus.');
      await onRefresh();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Gagal menghapus peminjaman.', 'error');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Peminjaman Perangkat</h2>
          <p className="text-sm text-slate-500">
            Ajukan dan pantau peminjaman peralatan laboratorium komputer.
          </p>
        </div>
        <button
          type="button"
          disabled={assets.length === 0}
          onClick={openCreate}
          className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold inline-flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          Ajukan Peminjaman
        </button>
      </div>

      {assets.length === 0 && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
          Belum ada aset di inventaris. Tambahkan aset terlebih dahulu sebelum mengajukan peminjaman.
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Perangkat</th>
                <th className="px-4 py-3 font-semibold">Peminjam</th>
                <th className="px-4 py-3 font-semibold">Tanggal</th>
                <th className="px-4 py-3 font-semibold">Keperluan</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loans.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                    Belum ada data peminjaman.
                  </td>
                </tr>
              ) : (
                loans.map((loan) => {
                  const canDelete =
                    isAdmin || (loan.requesterId === profile.uid && loan.status === 'Menunggu');
                  return (
                    <tr key={loan.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900">{loan.assetName}</div>
                        <div className="font-mono text-xs text-slate-500">{loan.assetCode}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-800">{loan.borrowerName}</div>
                        <div className="text-xs text-slate-500">
                          {loan.borrowerRole} • {loan.unit}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">
                        {loan.borrowDate} → {loan.returnDate}
                      </td>
                      <td className="px-4 py-3 text-slate-700 max-w-xs">
                        <div className="truncate">{loan.purpose}</div>
                        {loan.notes && (
                          <div className="text-xs text-slate-400 truncate">{loan.notes}</div>
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
                          <span className="inline-block px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-100 text-slate-700">
                            {loan.status}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          {isAdmin && loan.status === 'Menunggu' && (
                            <button
                              type="button"
                              onClick={() => handleStatusChange(loan, 'Disetujui')}
                              title="Setujui Cepat"
                              className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 cursor-pointer"
                            >
                              <Check className="w-4 h-4" />
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

      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h3 className="font-bold text-slate-900">Ajukan Peminjaman Aset</h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Pilih Perangkat *
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Nama Peminjam *
                  </label>
                  <input
                    type="text"
                    required
                    value={borrowerName}
                    onChange={(e) => setBorrowerName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Status Peminjam *
                  </label>
                  <select
                    value={borrowerRole}
                    onChange={(e) => setBorrowerRole(e.target.value as PersonRole)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white"
                  >
                    {PERSON_ROLES.map((r) => (
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
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
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
                  disabled={saving}
                  className="px-4 py-2 rounded-xl text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white cursor-pointer"
                >
                  {saving ? 'Mengirim...' : 'Kirim Pengajuan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
