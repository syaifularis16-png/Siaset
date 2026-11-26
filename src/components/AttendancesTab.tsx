import React, { useState } from 'react';
import { LogIn, LogOut, Trash2, X } from 'lucide-react';
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

export const AttendancesTab: React.FC<AttendancesTabProps> = ({
  attendances,
  profile,
  isAdmin,
  onRefresh,
  onNotify,
}) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [date, setDate] = useState(todayIsoDate());
  const [checkInTime, setCheckInTime] = useState(currentHmTime());
  const [visitorName, setVisitorName] = useState(profile.displayName);
  const [visitorRole, setVisitorRole] = useState<PersonRole>('Guru');
  const [unit, setUnit] = useState(profile.unit || 'Lab Komputer');
  const [activity, setActivity] = useState('');
  const [workstation, setWorkstation] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const openCreate = () => {
    setDate(todayIsoDate());
    setCheckInTime(currentHmTime());
    setVisitorName(profile.displayName);
    setUnit(profile.unit || 'Lab Komputer');
    setActivity('');
    setWorkstation('');
    setNotes('');
    setModalOpen(true);
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
          <h2 className="text-lg font-bold text-slate-900">Absensi Pengunjung Lab</h2>
          <p className="text-sm text-slate-500">
            Pencatatan kehadiran guru, siswa, dan teknisi di ruang komputer.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold inline-flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
        >
          <LogIn className="w-4 h-4" />
          Catat Masuk Lab
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Tanggal & Waktu</th>
                <th className="px-4 py-3 font-semibold">Pengunjung</th>
                <th className="px-4 py-3 font-semibold">Kegiatan</th>
                <th className="px-4 py-3 font-semibold">Meja / PC</th>
                <th className="px-4 py-3 font-semibold text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {attendances.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                    Belum ada catatan absensi pengunjung.
                  </td>
                </tr>
              ) : (
                attendances.map((att) => {
                  const canCheckOut =
                    !att.checkOutTime && (isAdmin || att.userId === profile.uid);
                  return (
                    <tr key={att.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3 font-mono text-xs">
                        <div className="font-semibold text-slate-900">{att.date}</div>
                        <div className="text-slate-500">
                          {att.checkInTime} – {att.checkOutTime || 'Aktif'}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-800">{att.visitorName}</div>
                        <div className="text-xs text-slate-500">
                          {att.visitorRole} • {att.unit}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        <div>{att.activity}</div>
                        {att.notes && <div className="text-xs text-slate-400">{att.notes}</div>}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">
                        {att.workstation || '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
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
                            <button
                              type="button"
                              onClick={() => handleDelete(att)}
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
                  className="px-4 py-2 rounded-xl text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white cursor-pointer"
                >
                  {saving ? 'Menyimpan...' : 'Simpan Absensi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
