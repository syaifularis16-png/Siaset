import React, { useMemo, useState } from 'react';
import { LogIn, LogOut, Pencil, Search, Trash2, X } from 'lucide-react';
import { apiFetch } from '../lib/api';
import {
  PERSON_ROLES,
  currentHmTime,
  todayIsoDate,
  type Attendance,
  type PersonRole,
  type UserProfile,
} from '../types';

interface AttendancesTabProps {
  attendances: Attendance[];
  profile: UserProfile;
  isAdmin: boolean;
  onRefresh: () => Promise<void>;
  onNotify: (msg: string, type?: 'success' | 'error') => void;
}

function calcDuration(inTime: string, outTime: string): string {
  if (!inTime || !outTime) return '';
  const [ih, im] = inTime.split(':').map(Number);
  const [oh, om] = outTime.split(':').map(Number);
  if ([ih, im, oh, om].some((n) => Number.isNaN(n))) return '';
  const mins = oh * 60 + om - (ih * 60 + im);
  if (mins <= 0) return '';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}j ${m}m` : `${m}m`;
}

export const AttendancesTab: React.FC<AttendancesTabProps> = ({
  attendances,
  profile,
  isAdmin,
  onRefresh,
  onNotify,
}) => {
  const today = todayIsoDate();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'DONE'>('ALL');
  const [dateFilter, setDateFilter] = useState('');

  // Create Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [date, setDate] = useState(today);
  const [checkInTime, setCheckInTime] = useState(currentHmTime());
  const [visitorName, setVisitorName] = useState(profile.displayName);
  const [visitorRole, setVisitorRole] = useState<PersonRole>('Guru');
  const [unit, setUnit] = useState(profile.unit || 'Lab Komputer');
  const [activity, setActivity] = useState('');
  const [workstation, setWorkstation] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Admin Edit Modal
  const [editAtt, setEditAtt] = useState<Attendance | null>(null);
  const [editCheckOut, setEditCheckOut] = useState('');
  const [editWorkstation, setEditWorkstation] = useState('');
  const [editActivity, setEditActivity] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [bulkClosing, setBulkClosing] = useState(false);

  const stats = useMemo(() => {
    const todayVisits = attendances.filter((a) => a.date === today).length;
    const activeList = attendances.filter((a) => !a.checkOutTime);
    const unitCounts = new Map<string, number>();
    for (const a of attendances) {
      if (a.unit) unitCounts.set(a.unit, (unitCounts.get(a.unit) ?? 0) + 1);
    }
    let topUnit = '—';
    let topCount = 0;
    for (const [u, c] of unitCounts.entries()) {
      if (c > topCount) {
        topUnit = u;
        topCount = c;
      }
    }
    return {
      todayVisits,
      activeCount: activeList.length,
      activeList,
      total: attendances.length,
      topUnit,
    };
  }, [attendances, today]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return attendances.filter((att) => {
      if (statusFilter === 'ACTIVE' && att.checkOutTime) return false;
      if (statusFilter === 'DONE' && !att.checkOutTime) return false;
      if (dateFilter && att.date !== dateFilter) return false;
      if (!q) return true;
      return (
        att.visitorName.toLowerCase().includes(q) ||
        att.unit.toLowerCase().includes(q) ||
        att.activity.toLowerCase().includes(q) ||
        att.workstation.toLowerCase().includes(q)
      );
    });
  }, [attendances, search, statusFilter, dateFilter]);

  const openCreate = () => {
    setDate(today);
    setCheckInTime(currentHmTime());
    setVisitorName(profile.displayName);
    setUnit(profile.unit || 'Lab Komputer');
    setActivity('');
    setWorkstation('');
    setNotes('');
    setModalOpen(true);
  };

  const openEdit = (att: Attendance) => {
    setEditAtt(att);
    setEditCheckOut(att.checkOutTime || '');
    setEditWorkstation(att.workstation || '');
    setEditActivity(att.activity || '');
    setEditNotes(att.notes || '');
  };

  const handleCheckIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch('/api/attendances', {
        method: 'POST',
        body: JSON.stringify({
          date,
          checkInTime,
          checkOutTime: '',
          visitorName,
          visitorRole,
          unit,
          activity,
          workstation,
          notes,
        }),
      });
      onNotify('Absensi masuk berhasil dicatat.');
      setModalOpen(false);
      await onRefresh();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Gagal mencatat absensi.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleEditSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editAtt) return;
    setEditSaving(true);
    try {
      await apiFetch(`/api/attendances/${editAtt.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          checkOutTime: editCheckOut,
          workstation: editWorkstation,
          activity: editActivity,
          notes: editNotes,
        }),
      });
      onNotify('Catatan absensi berhasil diperbarui.');
      setEditAtt(null);
      await onRefresh();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Gagal memperbarui absensi.', 'error');
    } finally {
      setEditSaving(false);
    }
  };

  const handleCheckOut = async (att: Attendance) => {
    try {
      await apiFetch(`/api/attendances/${att.id}`, {
        method: 'PUT',
        body: JSON.stringify({ checkOutTime: currentHmTime() }),
      });
      onNotify('Absensi keluar tercatat.');
      await onRefresh();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Gagal mencatat keluar.', 'error');
    }
  };

  const handleBulkCheckOut = async () => {
    if (stats.activeList.length === 0) return;
    setBulkClosing(true);
    const nowTime = currentHmTime();
    try {
      await Promise.all(
        stats.activeList.map((att) =>
          apiFetch(`/api/attendances/${att.id}`, {
            method: 'PUT',
            body: JSON.stringify({ checkOutTime: nowTime }),
          })
        )
      );
      onNotify(`${stats.activeList.length} pengunjung aktif berhasil dicatat keluar.`);
      await onRefresh();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Gagal mencatat keluar massal.', 'error');
    } finally {
      setBulkClosing(false);
    }
  };

  const handleDelete = async (att: Attendance) => {
    try {
      await apiFetch(`/api/attendances/${att.id}`, { method: 'DELETE' });
      onNotify('Catatan absensi dihapus.');
      await onRefresh();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Gagal menghapus absensi.', 'error');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">
            Absensi Pengunjung Lab
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Pencatatan kehadiran guru, siswa, dan teknisi beserta durasi serta nomor workstation.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          {isAdmin && stats.activeCount > 0 && (
            <button
              type="button"
              disabled={bulkClosing}
              onClick={handleBulkCheckOut}
              className="px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium inline-flex items-center gap-1.5 cursor-pointer"
            >
              <LogOut className="w-4 h-4 text-emerald-600" />
              {bulkClosing ? 'Memproses...' : `Keluar Semua (${stats.activeCount})`}
            </button>
          )}
          <button
            type="button"
            onClick={openCreate}
            className="px-4 py-2.5 rounded-xl bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-sm font-semibold inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <LogIn className="w-4 h-4" />
            Catat Masuk Lab
          </button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white rounded-2xl border border-slate-200/90 px-4 py-3.5">
          <div className="text-xs text-slate-500">Kunjungan Hari Ini</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-0.5">
            {stats.todayVisits}
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200/90 px-4 py-3.5">
          <div className="text-xs text-slate-500">Sedang Berada di Lab</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-emerald-700 mt-0.5">
            {stats.activeCount}
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200/90 px-4 py-3.5">
          <div className="text-xs text-slate-500">Total Log Kunjungan</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-0.5">
            {stats.total}
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200/90 px-4 py-3.5">
          <div className="text-xs text-slate-500">Unit / Kelas Teraktif</div>
          <div className="text-sm font-bold text-slate-900 mt-1.5 truncate">{stats.topUnit}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama, kegiatan, PC..."
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-white border border-slate-200 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#2563eb]"
            />
          </div>
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-700 bg-white focus:outline-none focus:border-[#2563eb]"
          />
          {dateFilter && (
            <button
              type="button"
              onClick={() => setDateFilter('')}
              className="text-xs font-semibold text-slate-500 hover:text-slate-800 cursor-pointer"
            >
              Reset tanggal
            </button>
          )}
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-200/60 rounded-xl">
          {[
            { key: 'ALL', label: 'Semua' },
            { key: 'ACTIVE', label: 'Sedang di Lab' },
            { key: 'DONE', label: 'Sudah Keluar' },
          ].map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setStatusFilter(item.key as typeof statusFilter)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                statusFilter === item.key
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/90 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Tanggal & Waktu</th>
                <th className="px-4 py-3 font-semibold">Pengunjung</th>
                <th className="px-4 py-3 font-semibold">Kegiatan</th>
                <th className="px-4 py-3 font-semibold">Meja / PC</th>
                <th className="px-4 py-3 font-semibold text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                    Tidak ada catatan absensi yang sesuai.
                  </td>
                </tr>
              ) : (
                filtered.map((att) => {
                  const canCheckOut =
                    !att.checkOutTime && (isAdmin || att.userId === profile.uid);
                  const duration = calcDuration(att.checkInTime, att.checkOutTime);
                  return (
                    <tr key={att.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3 font-mono text-xs">
                        <div className="font-semibold text-slate-900">{att.date}</div>
                        <div className="text-slate-500">
                          {att.checkInTime} –{' '}
                          {att.checkOutTime ? (
                            att.checkOutTime
                          ) : (
                            <span className="font-sans font-semibold text-emerald-700">
                              Aktif
                            </span>
                          )}
                        </div>
                        {duration && (
                          <div className="font-sans text-[11px] text-slate-400">
                            Durasi {duration}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-800">{att.visitorName}</div>
                        <div className="text-xs text-slate-500">
                          {att.visitorRole} · {att.unit}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        <div>{att.activity}</div>
                        {att.notes && <div className="text-xs text-slate-400">{att.notes}</div>}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">
                        {att.workstation || '—'}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          {canCheckOut && (
                            <button
                              type="button"
                              onClick={() => handleCheckOut(att)}
                              className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 text-xs font-medium inline-flex items-center gap-1 cursor-pointer"
                            >
                              <LogOut className="w-3.5 h-3.5" />
                              Keluar
                            </button>
                          )}
                          {isAdmin && (
                            <>
                              <button
                                type="button"
                                onClick={() => openEdit(att)}
                                title="Edit Catatan"
                                className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 cursor-pointer"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDelete(att)}
                                title="Hapus"
                                className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                              >
                                <Trash2 className="w-4 h-4" />
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

      {/* Create Check-in Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h3 className="font-bold text-slate-900">Catat Absensi Masuk Lab</h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCheckIn} className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Tanggal *</label>
                  <input
                    type="date"
                    required
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Jam Masuk *
                  </label>
                  <input
                    type="time"
                    required
                    value={checkInTime}
                    onChange={(e) => setCheckInTime(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Nama Pengunjung *
                  </label>
                  <input
                    type="text"
                    required
                    value={visitorName}
                    onChange={(e) => setVisitorName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Peran *</label>
                  <select
                    value={visitorRole}
                    onChange={(e) => setVisitorRole(e.target.value as PersonRole)}
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
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Nomor PC / Meja
                  </label>
                  <input
                    type="text"
                    value={workstation}
                    onChange={(e) => setWorkstation(e.target.value)}
                    placeholder="cth. PC-08"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Kegiatan / Tujuan *
                </label>
                <input
                  type="text"
                  required
                  value={activity}
                  onChange={(e) => setActivity(e.target.value)}
                  placeholder="cth. Pembelajaran MYOB Kelas XII AKL"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Catatan</label>
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
                  className="px-4 py-2 rounded-xl text-sm font-semibold bg-[#2563eb] hover:bg-[#1d4ed8] disabled:opacity-60 text-white cursor-pointer"
                >
                  {saving ? 'Menyimpan...' : 'Simpan Absensi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Admin Edit Attendance Modal */}
      {editAtt && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-900">Edit Catatan Absensi</h3>
                <p className="text-xs text-slate-500">
                  {editAtt.visitorName} · {editAtt.date}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditAtt(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleEditSave} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Jam Keluar
                  </label>
                  <input
                    type="time"
                    value={editCheckOut}
                    onChange={(e) => setEditCheckOut(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Nomor PC / Meja
                  </label>
                  <input
                    type="text"
                    value={editWorkstation}
                    onChange={(e) => setEditWorkstation(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Kegiatan / Tujuan *
                </label>
                <input
                  type="text"
                  required
                  value={editActivity}
                  onChange={(e) => setEditActivity(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Catatan</label>
                <input
                  type="text"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                />
              </div>
              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditAtt(null)}
                  className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={editSaving}
                  className="px-4 py-2 rounded-xl text-sm font-semibold bg-[#2563eb] hover:bg-[#1d4ed8] disabled:opacity-60 text-white cursor-pointer"
                >
                  {editSaving ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
