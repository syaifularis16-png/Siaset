import React, { useState } from 'react';
import { Plus, Trash2, Check, X } from 'lucide-react';
import { apiFetch } from '../lib/api';
import {
  PERSON_ROLES,
  SCHEDULE_STATUSES,
  todayIsoDate,
  type LabSchedule,
  type PersonRole,
  type ScheduleStatus,
  type UserProfile,
} from '../types';

interface SchedulesTabProps {
  schedules: LabSchedule[];
  profile: UserProfile;
  isAdmin: boolean;
  onRefresh: () => Promise<void>;
  onNotify: (msg: string, type?: 'success' | 'error') => void;
}

export const SchedulesTab: React.FC<SchedulesTabProps> = ({
  schedules,
  profile,
  isAdmin,
  onRefresh,
  onNotify,
}) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [date, setDate] = useState(todayIsoDate());
  const [startTime, setStartTime] = useState('07:30');
  const [endTime, setEndTime] = useState('09:30');
  const [activity, setActivity] = useState('');
  const [requesterName, setRequesterName] = useState(profile.displayName);
  const [requesterRole, setRequesterRole] = useState<PersonRole>('Guru');
  const [unit, setUnit] = useState(profile.unit || 'Lab Komputer');
  const [saving, setSaving] = useState(false);

  const openCreate = () => {
    setDate(todayIsoDate());
    setStartTime('07:30');
    setEndTime('09:30');
    setActivity('');
    setRequesterName(profile.displayName);
    setUnit(profile.unit || 'Lab Komputer');
    setModalOpen(true);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch('/api/schedules', {
        method: 'POST',
        body: JSON.stringify({
          date,
          startTime,
          endTime,
          activity,
          requesterName,
          requesterRole,
          unit,
        }),
      });
      onNotify('Jadwal penggunaan lab berhasil diajukan.');
      setModalOpen(false);
      await onRefresh();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Gagal mengajukan jadwal.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (schedule: LabSchedule, status: ScheduleStatus) => {
    try {
      await apiFetch(`/api/schedules/${schedule.id}`, {
        method: 'PUT',
        body: JSON.stringify({ status }),
      });
      onNotify(`Status jadwal diubah ke ${status}.`);
      await onRefresh();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Gagal memperbarui status.', 'error');
    }
  };

  const handleDelete = async (schedule: LabSchedule) => {
    try {
      await apiFetch(`/api/schedules/${schedule.id}`, { method: 'DELETE' });
      onNotify('Jadwal dihapus.');
      await onRefresh();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Gagal menghapus jadwal.', 'error');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Penjadwalan Laboratorium</h2>
          <p className="text-sm text-slate-500">
            Pengajuan dan persetujuan sesi praktik di laboratorium komputer.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold inline-flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          Ajukan Jadwal
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Tanggal & Jam</th>
                <th className="px-4 py-3 font-semibold">Kegiatan</th>
                <th className="px-4 py-3 font-semibold">Penanggung Jawab</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {schedules.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                    Belum ada jadwal laboratorium yang tercatat.
                  </td>
                </tr>
              ) : (
                schedules.map((s) => {
                  const canDelete =
                    isAdmin || (s.requesterId === profile.uid && s.status === 'Menunggu');
                  return (
                    <tr key={s.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3 font-mono text-xs text-slate-700">
                        <div className="font-semibold text-slate-900">{s.date}</div>
                        <div className="text-slate-500">
                          {s.startTime} – {s.endTime}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900">{s.activity}</td>
                      <td className="px-4 py-3">
                        <div className="text-slate-800">{s.requesterName}</div>
                        <div className="text-xs text-slate-500">
                          {s.requesterRole} • {s.unit}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {isAdmin ? (
                          <select
                            value={s.status}
                            onChange={(e) =>
                              handleStatusChange(s, e.target.value as ScheduleStatus)
                            }
                            className="px-2.5 py-1 rounded-lg border border-slate-200 text-xs font-medium bg-white"
                          >
                            {SCHEDULE_STATUSES.map((st) => (
                              <option key={st} value={st}>
                                {st}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="inline-block px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-100 text-slate-700">
                            {s.status}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          {isAdmin && s.status === 'Menunggu' && (
                            <button
                              type="button"
                              onClick={() => handleStatusChange(s, 'Disetujui')}
                              title="Setujui"
                              className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 cursor-pointer"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                          )}
                          {canDelete && (
                            <button
                              type="button"
                              onClick={() => handleDelete(s)}
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
              <h3 className="font-bold text-slate-900">Ajukan Penggunaan Lab</h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                  <label className="block text-xs font-medium text-slate-700 mb-1">Mulai *</label>
                  <input
                    type="time"
                    required
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Selesai *</label>
                  <input
                    type="time"
                    required
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Nama Kegiatan / Mata Pelajaran *
                </label>
                <input
                  type="text"
                  required
                  value={activity}
                  onChange={(e) => setActivity(e.target.value)}
                  placeholder="cth. Praktikum Spreadsheet Akuntansi"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Penanggung Jawab *
                  </label>
                  <input
                    type="text"
                    required
                    value={requesterName}
                    onChange={(e) => setRequesterName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Peran *</label>
                  <select
                    value={requesterRole}
                    onChange={(e) => setRequesterRole(e.target.value as PersonRole)}
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
                  {saving ? 'Mengirim...' : 'Ajukan Jadwal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
