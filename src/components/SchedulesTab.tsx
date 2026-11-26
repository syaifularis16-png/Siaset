import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  Check,
  Pencil,
  Plus,
  Search,
  Table2,
  Trash2,
  X,
} from 'lucide-react';
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

function timeRangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  if (!aStart || !aEnd || !bStart || !bEnd) return false;
  return aStart < bEnd && aEnd > bStart;
}

export const SchedulesTab: React.FC<SchedulesTabProps> = ({
  schedules,
  profile,
  isAdmin,
  onRefresh,
  onNotify,
}) => {
  const today = todayIsoDate();
  const [viewMode, setViewMode] = useState<'table' | 'agenda'>('table');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | ScheduleStatus>('ALL');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<LabSchedule | null>(null);
  const [date, setDate] = useState(today);
  const [startTime, setStartTime] = useState('07:30');
  const [endTime, setEndTime] = useState('09:30');
  const [activity, setActivity] = useState('');
  const [requesterName, setRequesterName] = useState(profile.displayName);
  const [requesterRole, setRequesterRole] = useState<PersonRole>('Guru');
  const [unit, setUnit] = useState(profile.unit || 'Lab Komputer');
  const [saving, setSaving] = useState(false);

  const stats = useMemo(() => {
    const waiting = schedules.filter((s) => s.status === 'Menunggu').length;
    const approved = schedules.filter((s) => s.status === 'Disetujui').length;
    const todayCount = schedules.filter(
      (s) => s.date === today && s.status !== 'Ditolak'
    ).length;
    const done = schedules.filter((s) => s.status === 'Selesai').length;
    return { waiting, approved, todayCount, done };
  }, [schedules, today]);

  const conflictMap = useMemo(() => {
    const set = new Set<string>();
    const active = schedules.filter(
      (s) => s.status === 'Menunggu' || s.status === 'Disetujui'
    );
    for (let i = 0; i < active.length; i++) {
      for (let j = i + 1; j < active.length; j++) {
        if (
          active[i].date === active[j].date &&
          timeRangesOverlap(
            active[i].startTime,
            active[i].endTime,
            active[j].startTime,
            active[j].endTime
          )
        ) {
          set.add(active[i].id);
          set.add(active[j].id);
        }
      }
    }
    return set;
  }, [schedules]);

  const formConflicts = useMemo(() => {
    if (!date || !startTime || !endTime) return [];
    return schedules.filter((s) => {
      if (editingSchedule && s.id === editingSchedule.id) return false;
      if (s.date !== date) return false;
      if (s.status !== 'Menunggu' && s.status !== 'Disetujui') return false;
      return timeRangesOverlap(startTime, endTime, s.startTime, s.endTime);
    });
  }, [schedules, date, startTime, endTime, editingSchedule]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return schedules.filter((s) => {
      if (statusFilter !== 'ALL' && s.status !== statusFilter) return false;
      if (!q) return true;
      return (
        s.activity.toLowerCase().includes(q) ||
        s.requesterName.toLowerCase().includes(q) ||
        s.unit.toLowerCase().includes(q) ||
        s.date.includes(q)
      );
    });
  }, [schedules, search, statusFilter]);

  const groupedByDate = useMemo(() => {
    const map = new Map<string, LabSchedule[]>();
    const sorted = [...filtered].sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return a.startTime.localeCompare(b.startTime);
    });
    for (const s of sorted) {
      const list = map.get(s.date) ?? [];
      list.push(s);
      map.set(s.date, list);
    }
    return Array.from(map.entries());
  }, [filtered]);

  const openCreate = () => {
    setEditingSchedule(null);
    setDate(today);
    setStartTime('07:30');
    setEndTime('09:30');
    setActivity('');
    setRequesterName(profile.displayName);
    setUnit(profile.unit || 'Lab Komputer');
    setModalOpen(true);
  };

  const openEdit = (s: LabSchedule) => {
    setEditingSchedule(s);
    setDate(s.date);
    setStartTime(s.startTime);
    setEndTime(s.endTime);
    setActivity(s.activity);
    setRequesterName(s.requesterName);
    setRequesterRole(s.requesterRole);
    setUnit(s.unit);
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (endTime <= startTime) {
      onNotify('Jam selesai harus lebih lambat dari jam mulai.', 'error');
      return;
    }
    setSaving(true);
    try {
      if (editingSchedule) {
        await apiFetch(`/api/schedules/${editingSchedule.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            date,
            startTime,
            endTime,
            activity,
            unit,
          }),
        });
        onNotify('Jadwal laboratorium berhasil diperbarui.');
      } else {
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
      }
      setModalOpen(false);
      await onRefresh();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Gagal menyimpan jadwal.', 'error');
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
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">
            Penjadwalan Laboratorium
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Pengajuan sesi praktik, deteksi bentrok waktu, dan papan agenda per tanggal.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <div className="flex items-center p-1 bg-slate-200/60 rounded-xl">
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'table'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Table2 className="w-3.5 h-3.5" />
              Tabel
            </button>
            <button
              type="button"
              onClick={() => setViewMode('agenda')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'agenda'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <CalendarDays className="w-3.5 h-3.5" />
              Agenda
            </button>
          </div>
          <button
            type="button"
            onClick={openCreate}
            className="px-4 py-2.5 rounded-xl bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-sm font-semibold inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <Plus className="w-4 h-4" />
            Ajukan Jadwal
          </button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white rounded-2xl border border-slate-200/90 px-4 py-3.5">
          <div className="text-xs text-slate-500">Agenda Hari Ini</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-0.5">
            {stats.todayCount}
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200/90 px-4 py-3.5">
          <div className="text-xs text-slate-500">Menunggu Konfirmasi</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-amber-600 mt-0.5">
            {stats.waiting}
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200/90 px-4 py-3.5">
          <div className="text-xs text-slate-500">Disetujui</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-emerald-700 mt-0.5">
            {stats.approved}
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200/90 px-4 py-3.5">
          <div className="text-xs text-slate-500">Potensi Bentrok</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-rose-600 mt-0.5">
            {conflictMap.size}
          </div>
        </div>
      </div>

      {/* Search & Status Filter */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari kegiatan, guru, kelas..."
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-white border border-slate-200 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#2563eb]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-200/60 rounded-xl">
          {(['ALL', ...SCHEDULE_STATUSES] as const).map((st) => (
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

      {viewMode === 'table' ? (
        <div className="bg-white rounded-2xl border border-slate-200/90 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Tanggal & Jam</th>
                  <th className="px-4 py-3 font-semibold">Kegiatan</th>
                  <th className="px-4 py-3 font-semibold">Penanggung Jawab</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                      Tidak ada jadwal laboratorium yang sesuai.
                    </td>
                  </tr>
                ) : (
                  filtered.map((s) => {
                    const isOwnerPending =
                      s.requesterId === profile.uid && s.status === 'Menunggu';
                    const canEdit = isAdmin || isOwnerPending;
                    const canDelete = isAdmin || isOwnerPending;
                    const hasConflict = conflictMap.has(s.id);

                    return (
                      <tr key={s.id} className="hover:bg-slate-50/70">
                        <td className="px-4 py-3 font-mono text-xs text-slate-700">
                          <div className="font-semibold text-slate-900">{s.date}</div>
                          <div className="text-slate-500">
                            {s.startTime} – {s.endTime}
                          </div>
                          {hasConflict && (
                            <div className="font-sans text-[11px] font-semibold text-rose-600 mt-0.5">
                              Bentrok jam
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-900">{s.activity}</td>
                        <td className="px-4 py-3">
                          <div className="text-slate-800">{s.requesterName}</div>
                          <div className="text-xs text-slate-500">
                            {s.requesterRole} · {s.unit}
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
                            <span
                              className={`text-xs font-semibold ${
                                s.status === 'Disetujui'
                                  ? 'text-emerald-700'
                                  : s.status === 'Menunggu'
                                    ? 'text-amber-700'
                                    : s.status === 'Ditolak'
                                      ? 'text-rose-600'
                                      : 'text-slate-600'
                              }`}
                            >
                              {s.status}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
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
                            {canEdit && (
                              <button
                                type="button"
                                onClick={() => openEdit(s)}
                                title="Edit Jadwal"
                                className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 cursor-pointer"
                              >
                                <Pencil className="w-4 h-4" />
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
      ) : (
        <div className="space-y-4">
          {groupedByDate.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200/90 p-10 text-center text-sm text-slate-500">
              Tidak ada agenda jadwal laboratorium yang sesuai.
            </div>
          ) : (
            groupedByDate.map(([dateKey, items]) => (
              <div
                key={dateKey}
                className="bg-white rounded-2xl border border-slate-200/90 overflow-hidden"
              >
                <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <div className="font-mono text-sm font-bold text-slate-900">
                    {dateKey}
                    {dateKey === today && (
                      <span className="ml-2 font-sans text-xs font-semibold text-[#2563eb]">
                        (Hari Ini)
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-slate-500">{items.length} sesi</span>
                </div>
                <div className="divide-y divide-slate-100">
                  {items.map((s) => (
                    <div
                      key={s.id}
                      className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                    >
                      <div className="flex items-start gap-4 min-w-0">
                        <div className="font-mono text-xs font-semibold text-slate-700 shrink-0 pt-0.5">
                          {s.startTime} – {s.endTime}
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-900 text-sm">{s.activity}</div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            {s.requesterName} · {s.requesterRole} · {s.unit}
                            {conflictMap.has(s.id) && (
                              <span className="ml-2 text-rose-600 font-semibold">
                                · Bentrok jadwal
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="text-xs font-semibold text-slate-700 shrink-0">
                        {s.status}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h3 className="font-bold text-slate-900">
                {editingSchedule ? 'Edit Jadwal Lab' : 'Ajukan Penggunaan Lab'}
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
              {formConflicts.length > 0 && (
                <div className="rounded-xl bg-rose-50 border border-rose-200 px-3.5 py-2.5 text-xs text-rose-700 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    Jam ini beririsan dengan jadwal{' '}
                    <strong>{formConflicts[0].activity}</strong> ({formConflicts[0].startTime}–
                    {formConflicts[0].endTime}, {formConflicts[0].status}).
                  </span>
                </div>
              )}

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
                    disabled={Boolean(editingSchedule)}
                    value={requesterName}
                    onChange={(e) => setRequesterName(e.target.value)}
                    className={`w-full px-3 py-2 rounded-xl border border-slate-200 text-sm ${
                      editingSchedule ? 'bg-slate-50 text-slate-600' : ''
                    }`}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Peran *</label>
                  <select
                    disabled={Boolean(editingSchedule)}
                    value={requesterRole}
                    onChange={(e) => setRequesterRole(e.target.value as PersonRole)}
                    className={`w-full px-3 py-2 rounded-xl border border-slate-200 text-sm ${
                      editingSchedule ? 'bg-slate-50 text-slate-600' : 'bg-white'
                    }`}
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
                  className="px-4 py-2 rounded-xl text-sm font-semibold bg-[#2563eb] hover:bg-[#1d4ed8] disabled:opacity-60 text-white cursor-pointer"
                >
                  {saving ? 'Menyimpan...' : editingSchedule ? 'Simpan Perubahan' : 'Ajukan Jadwal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
