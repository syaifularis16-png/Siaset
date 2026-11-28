import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CalendarDays,
  CalendarRange,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Eye,
  LayoutGrid,
  MessageSquareText,
  MonitorPlay,
  Pencil,
  Plus,
  Repeat,
  Search,
  Sparkles,
  Table2,
  Trash2,
  Users,
  Wrench,
  X,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import {
  buildConflictMap,
  dateRangesOverlap,
  effectiveEndDate,
  findConflictsForSlot,
  getFreeSlotsForDate,
  getUserScheduleConflictNotifications,
  scheduleCoversDate,
} from '../lib/scheduleConflicts';
import {
  LESSON_PERIOD_OPTIONS,
  PERSON_ROLES,
  SCHEDULE_EQUIPMENT_OPTIONS,
  SCHEDULE_SETUP_TYPES,
  SCHEDULE_STATUSES,
  SCHEDULE_VENUE_META,
  SCHEDULE_VENUES,
  toLocalIsoDate,
  todayIsoDate,
  type LabSchedule,
  type PersonRole,
  type ScheduleStatus,
  type ScheduleVenue,
  type UserProfile,
} from '../types';

interface SchedulesTabProps {
  schedules: LabSchedule[];
  profile: UserProfile;
  isAdmin: boolean;
  onRefresh: () => Promise<void>;
  onNotify: (msg: string, type?: 'success' | 'error') => void;
}

type ViewMode = 'timeline' | 'agenda' | 'table';
type ScopeFilter = 'ALL' | 'TODAY' | 'WEEK' | 'CONFLICTS';
type RecurrenceMode = 'NONE' | 'DAILY' | 'WEEKLY';

interface SessionPreset {
  value: string;
  label: string;
  startTime: string;
  endTime: string;
}

const SESSION_PRESETS: SessionPreset[] = [
  { value: 'Waktu Kustom', label: 'Waktu Kustom (Isi Manual)', startTime: '', endTime: '' },
  { value: 'Sesi Pagi', label: 'Sesi Pagi (07:00 - 12:00)', startTime: '07:00', endTime: '12:00' },
  { value: 'Sesi Siang', label: 'Sesi Siang (12:30 - 16:30)', startTime: '12:30', endTime: '16:30' },
  { value: 'Seharian', label: 'Seharian Penuh (07:00 - 16:30)', startTime: '07:00', endTime: '16:30' },
  ...LESSON_PERIOD_OPTIONS.map((opt) => ({
    value: opt.value,
    label: opt.label,
    startTime: opt.startTime,
    endTime: opt.endTime,
  })),
];

function shiftIsoDate(isoDate: string, deltaDays: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || !d) return isoDate;
  return toLocalIsoDate(new Date(y, m - 1, d + deltaDays));
}

function countDaysInclusive(startIso: string, endIso: string): number {
  const [sy, sm, sd] = startIso.split('-').map(Number);
  const [ey, em, ed] = endIso.split('-').map(Number);
  if (!sy || !sm || !sd || !ey || !em || !ed) return 1;
  const diff = Math.round(
    (Date.UTC(ey, em - 1, ed) - Date.UTC(sy, sm - 1, sd)) / 86400000
  );
  return Math.max(1, diff + 1);
}

function formatDateRangeLabel(s: Pick<LabSchedule, 'date' | 'endDate'>): string {
  const end = effectiveEndDate(s);
  return end > s.date ? `${s.date} s/d ${end}` : s.date;
}

function parseEquipmentNeeds(raw: string): { selected: string[]; custom: string } {
  const optionSet = new Set(SCHEDULE_EQUIPMENT_OPTIONS);
  const selected: string[] = [];
  const customParts: string[] = [];
  for (const part of raw.split(',')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    if (optionSet.has(trimmed)) {
      if (!selected.includes(trimmed)) selected.push(trimmed);
    } else {
      customParts.push(trimmed);
    }
  }
  return { selected, custom: customParts.join(', ') };
}

function serializeEquipmentNeeds(selected: string[], custom: string): string {
  const parts: string[] = [...selected];
  for (const piece of custom.split(',')) {
    const trimmed = piece.trim();
    if (trimmed && !parts.includes(trimmed)) {
      parts.push(trimmed);
    }
  }
  return parts.join(', ').slice(0, 240);
}

function statusBadgeClass(status: ScheduleStatus): string {
  switch (status) {
    case 'Disetujui':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'Menunggu':
      return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'Ditolak':
      return 'bg-rose-50 text-rose-700 border-rose-200';
    case 'Selesai':
    default:
      return 'bg-slate-100 text-slate-700 border-slate-200';
  }
}

export const SchedulesTab: React.FC<SchedulesTabProps> = ({
  schedules,
  profile,
  isAdmin,
  onRefresh,
  onNotify,
}) => {
  const today = todayIsoDate();
  const weekEnd = useMemo(() => shiftIsoDate(today, 6), [today]);

  const [viewMode, setViewMode] = useState<ViewMode>('timeline');
  const [timelineDate, setTimelineDate] = useState(today);
  const [search, setSearch] = useState('');
  const [venueFilter, setVenueFilter] = useState<'ALL' | ScheduleVenue>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | ScheduleStatus>('ALL');
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>('ALL');

  // Create / Edit modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<LabSchedule | null>(null);
  const [venue, setVenue] = useState<ScheduleVenue>('Aula');
  const [date, setDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [lessonPeriod, setLessonPeriod] = useState('Waktu Kustom');
  const [startTime, setStartTime] = useState('07:30');
  const [endTime, setEndTime] = useState('09:30');
  const [activity, setActivity] = useState('');
  const [setupType, setSetupType] = useState(SCHEDULE_SETUP_TYPES[0]);
  const [participantCount, setParticipantCount] = useState('30');
  const [selectedEquipment, setSelectedEquipment] = useState<string[]>([]);
  const [customEquipment, setCustomEquipment] = useState('');
  const [notes, setNotes] = useState('');
  const [requesterName, setRequesterName] = useState(profile.displayName);
  const [requesterRole, setRequesterRole] = useState<PersonRole>(
    profile.role === 'siswa' ? 'Siswa' : profile.role === 'teknisi' ? 'Teknisi' : 'Guru'
  );
  const [unit, setUnit] = useState(profile.unit || 'Umum');
  const [recurrence, setRecurrence] = useState<RecurrenceMode>('NONE');
  const [recurrenceCount, setRecurrenceCount] = useState(2);
  const [saving, setSaving] = useState(false);

  // Detail & Admin review modals
  const [detailSchedule, setDetailSchedule] = useState<LabSchedule | null>(null);
  const [reviewSchedule, setReviewSchedule] = useState<LabSchedule | null>(null);
  const [reviewStatus, setReviewStatus] = useState<ScheduleStatus>('Disetujui');
  const [reviewNotes, setReviewNotes] = useState('');
  const [reviewSaving, setReviewSaving] = useState(false);

  const stats = useMemo(() => {
    const waiting = schedules.filter((s) => s.status === 'Menunggu').length;
    const approved = schedules.filter((s) => s.status === 'Disetujui').length;
    const aulaCount = schedules.filter(
      (s) => s.venue === 'Aula' && s.status !== 'Ditolak'
    ).length;
    const multimediaCount = schedules.filter(
      (s) => s.venue === 'Multimedia' && s.status !== 'Ditolak'
    ).length;
    return { waiting, approved, aulaCount, multimediaCount };
  }, [schedules]);

  const conflictMap = useMemo(() => buildConflictMap(schedules), [schedules]);

  const myConflicts = useMemo(
    () => getUserScheduleConflictNotifications(schedules, profile.uid),
    [schedules, profile.uid]
  );

  // Generate series of dates when recurrence is enabled in create mode
  const generatedRecurrenceSlots = useMemo(() => {
    const safeEnd = endDate >= date ? endDate : date;
    if (editingSchedule || recurrence === 'NONE') {
      return [{ date, endDate: safeEnd }];
    }
    const stepDays = recurrence === 'WEEKLY' ? 7 : 1;
    const spanDays = countDaysInclusive(date, safeEnd) - 1;
    const count = Math.max(2, Math.min(8, recurrenceCount));
    const slots: Array<{ date: string; endDate: string }> = [];
    for (let i = 0; i < count; i++) {
      const start = shiftIsoDate(date, i * stepDays);
      const end = shiftIsoDate(start, spanDays);
      slots.push({ date: start, endDate: end });
    }
    return slots;
  }, [editingSchedule, recurrence, recurrenceCount, date, endDate]);

  // Conflicts per generated slot & aggregate across series
  const slotConflictPreviews = useMemo(() => {
    return generatedRecurrenceSlots.map((slot) => ({
      ...slot,
      conflicts: findConflictsForSlot(schedules, {
        venue,
        date: slot.date,
        endDate: slot.endDate,
        startTime,
        endTime,
        excludeId: editingSchedule?.id,
      }),
    }));
  }, [generatedRecurrenceSlots, schedules, venue, startTime, endTime, editingSchedule]);

  const formConflicts = useMemo(() => {
    const seen = new Set<string>();
    const list: LabSchedule[] = [];
    for (const item of slotConflictPreviews) {
      for (const c of item.conflicts) {
        if (!seen.has(c.id)) {
          seen.add(c.id);
          list.push(c);
        }
      }
    }
    return list;
  }, [slotConflictPreviews]);

  // Smart conflict resolution: check alternative venue & free slots on primary date
  const alternativeVenue = useMemo<ScheduleVenue | null>(() => {
    if (formConflicts.length === 0) return null;
    const other: ScheduleVenue = venue === 'Aula' ? 'Multimedia' : 'Aula';
    const hasAnyConflict = generatedRecurrenceSlots.some(
      (slot) =>
        findConflictsForSlot(schedules, {
          venue: other,
          date: slot.date,
          endDate: slot.endDate,
          startTime,
          endTime,
          excludeId: editingSchedule?.id,
        }).length > 0
    );
    return hasAnyConflict ? null : other;
  }, [
    formConflicts.length,
    venue,
    generatedRecurrenceSlots,
    schedules,
    startTime,
    endTime,
    editingSchedule,
  ]);

  const formFreeSlots = useMemo(
    () => getFreeSlotsForDate(schedules, venue, date, editingSchedule?.id, '07:00', '17:00'),
    [schedules, venue, date, editingSchedule]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return schedules.filter((s) => {
      if (venueFilter !== 'ALL' && s.venue !== venueFilter) return false;
      if (statusFilter !== 'ALL' && s.status !== statusFilter) return false;
      if (scopeFilter === 'TODAY' && !scheduleCoversDate(s, today)) return false;
      if (
        scopeFilter === 'WEEK' &&
        !dateRangesOverlap(s.date, effectiveEndDate(s), today, weekEnd)
      ) {
        return false;
      }
      if (scopeFilter === 'CONFLICTS' && (conflictMap.get(s.id)?.length ?? 0) === 0) {
        return false;
      }
      if (!q) return true;
      return (
        s.venue.toLowerCase().includes(q) ||
        s.activity.toLowerCase().includes(q) ||
        s.requesterName.toLowerCase().includes(q) ||
        s.unit.toLowerCase().includes(q) ||
        s.setupType.toLowerCase().includes(q) ||
        s.equipmentNeeds.toLowerCase().includes(q) ||
        s.notes.toLowerCase().includes(q) ||
        s.date.includes(q) ||
        effectiveEndDate(s).includes(q)
      );
    });
  }, [schedules, search, venueFilter, statusFilter, scopeFilter, today, weekEnd, conflictMap]);

  const groupedByDate = useMemo(() => {
    const map = new Map<string, LabSchedule[]>();
    const sorted = [...filtered].sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      if (a.startTime !== b.startTime) return a.startTime.localeCompare(b.startTime);
      return a.venue.localeCompare(b.venue);
    });
    for (const s of sorted) {
      const list = map.get(s.date) ?? [];
      list.push(s);
      map.set(s.date, list);
    }
    return Array.from(map.entries());
  }, [filtered]);

  const timelineVenues = useMemo(
    () => (venueFilter === 'ALL' ? SCHEDULE_VENUES : [venueFilter]),
    [venueFilter]
  );

  const openCreateWithPreset = (preset?: {
    venue?: ScheduleVenue;
    date?: string;
    endDate?: string;
    startTime?: string;
    endTime?: string;
    lessonPeriod?: string;
    activity?: string;
    setupType?: string;
    participantCount?: number;
    equipmentNeeds?: string;
    notes?: string;
    unit?: string;
  }) => {
    const targetDate = preset?.date || (viewMode === 'timeline' ? timelineDate : today);
    const targetEndDate =
      preset?.endDate && preset.endDate >= targetDate ? preset.endDate : targetDate;
    const parsedEquip = parseEquipmentNeeds(preset?.equipmentNeeds || '');

    setEditingSchedule(null);
    setVenue(preset?.venue ?? (venueFilter === 'Multimedia' ? 'Multimedia' : 'Aula'));
    setDate(targetDate);
    setEndDate(targetEndDate);
    setLessonPeriod(preset?.lessonPeriod || 'Waktu Kustom');
    setStartTime(preset?.startTime || '07:30');
    setEndTime(preset?.endTime || '09:30');
    setActivity(preset?.activity || '');
    setSetupType(preset?.setupType || SCHEDULE_SETUP_TYPES[0]);
    setParticipantCount(
      preset?.participantCount && preset.participantCount > 0
        ? String(preset.participantCount)
        : '30'
    );
    setSelectedEquipment(parsedEquip.selected);
    setCustomEquipment(parsedEquip.custom);
    setNotes(preset?.notes || '');
    setRequesterName(profile.displayName);
    setRequesterRole(
      profile.role === 'siswa' ? 'Siswa' : profile.role === 'teknisi' ? 'Teknisi' : 'Guru'
    );
    setUnit(preset?.unit || profile.unit || 'Umum');
    setRecurrence('NONE');
    setRecurrenceCount(2);
    setModalOpen(true);
  };

  const openDuplicate = (s: LabSchedule) => {
    const span = countDaysInclusive(s.date, effectiveEndDate(s)) - 1;
    const baseDate = s.date < today ? today : s.date;
    openCreateWithPreset({
      venue: s.venue,
      date: baseDate,
      endDate: shiftIsoDate(baseDate, span),
      startTime: s.startTime,
      endTime: s.endTime,
      lessonPeriod: s.lessonPeriod || 'Waktu Kustom',
      activity: s.activity,
      setupType: s.setupType || SCHEDULE_SETUP_TYPES[0],
      participantCount: s.participantCount || 30,
      equipmentNeeds: s.equipmentNeeds || '',
      notes: s.notes || '',
      unit: s.unit,
    });
  };

  const openEdit = (s: LabSchedule) => {
    const parsedEquip = parseEquipmentNeeds(s.equipmentNeeds || '');
    setEditingSchedule(s);
    setVenue(s.venue);
    setDate(s.date);
    setEndDate(effectiveEndDate(s));
    setLessonPeriod(s.lessonPeriod || 'Waktu Kustom');
    setStartTime(s.startTime);
    setEndTime(s.endTime);
    setActivity(s.activity);
    setSetupType(s.setupType || SCHEDULE_SETUP_TYPES[0]);
    setParticipantCount(String(s.participantCount || 0));
    setSelectedEquipment(parsedEquip.selected);
    setCustomEquipment(parsedEquip.custom);
    setNotes(s.notes || '');
    setRequesterName(s.requesterName);
    setRequesterRole(s.requesterRole);
    setUnit(s.unit);
    setRecurrence('NONE');
    setRecurrenceCount(2);
    setModalOpen(true);
  };

  const openReviewModal = (s: LabSchedule, initialStatus?: ScheduleStatus) => {
    setReviewSchedule(s);
    setReviewStatus(initialStatus ?? (s.status === 'Menunggu' ? 'Disetujui' : s.status));
    setReviewNotes(s.adminNotes || '');
  };

  const handleStartDateChange = (nextStart: string) => {
    setDate(nextStart);
    if (!endDate || endDate < nextStart || endDate === date) {
      setEndDate(nextStart);
    }
  };

  const handleSessionPresetChange = (presetValue: string) => {
    setLessonPeriod(presetValue);
    const match = SESSION_PRESETS.find((p) => p.value === presetValue);
    if (match && match.startTime && match.endTime) {
      setStartTime(match.startTime);
      setEndTime(match.endTime);
    }
  };

  const toggleEquipmentChip = (item: string) => {
    setSelectedEquipment((prev) =>
      prev.includes(item) ? prev.filter((x) => x !== item) : [...prev, item]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (endTime <= startTime) {
      onNotify('Jam selesai harus lebih lambat dari jam mulai.', 'error');
      return;
    }
    const safeEndDate = endDate >= date ? endDate : date;
    const equipmentNeeds = serializeEquipmentNeeds(selectedEquipment, customEquipment);
    const parsedParticipants = Math.max(0, Math.min(2000, Number(participantCount) || 0));

    setSaving(true);
    try {
      if (editingSchedule) {
        await apiFetch(`/api/schedules/${editingSchedule.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            venue,
            date,
            endDate: safeEndDate,
            startTime,
            endTime,
            lessonPeriod: lessonPeriod === 'Waktu Kustom' ? '' : lessonPeriod,
            activity,
            setupType,
            participantCount: parsedParticipants,
            equipmentNeeds,
            notes,
            unit,
          }),
        });
        if (formConflicts.length > 0) {
          onNotify(
            `Jadwal ${venue} diperbarui, namun terdeteksi bentrok waktu dengan "${formConflicts[0].activity}" (${formConflicts[0].startTime}–${formConflicts[0].endTime}).`,
            'error'
          );
        } else {
          onNotify(`Jadwal peminjaman ${venue} berhasil diperbarui.`);
        }
      } else {
        const res = await apiFetch<{ id: string; count?: number }>('/api/schedules', {
          method: 'POST',
          body: JSON.stringify({
            venue,
            date,
            endDate: safeEndDate,
            startTime,
            endTime,
            lessonPeriod: lessonPeriod === 'Waktu Kustom' ? '' : lessonPeriod,
            activity,
            setupType,
            participantCount: parsedParticipants,
            equipmentNeeds,
            notes,
            requesterName,
            requesterRole,
            unit,
            recurrenceDates:
              recurrence !== 'NONE' && generatedRecurrenceSlots.length > 1
                ? generatedRecurrenceSlots
                : undefined,
          }),
        });
        const totalCreated = res.count ?? 1;
        if (formConflicts.length > 0) {
          onNotify(
            `${totalCreated} jadwal ${venue} diajukan, namun terdapat bentrok waktu dengan "${formConflicts[0].activity}" (${formConflicts[0].startTime}–${formConflicts[0].endTime}).`,
            'error'
          );
        } else {
          onNotify(
            totalCreated > 1
              ? `${totalCreated} jadwal berulang Ruang ${venue} berhasil diajukan.`
              : `Pengajuan peminjaman Ruang ${venue} berhasil dikirim.`
          );
        }
      }
      setModalOpen(false);
      await onRefresh();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Gagal menyimpan jadwal.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (
    schedule: LabSchedule,
    status: ScheduleStatus,
    adminNotes?: string
  ) => {
    try {
      await apiFetch(`/api/schedules/${schedule.id}`, {
        method: 'PUT',
        body: JSON.stringify(
          adminNotes !== undefined ? { status, adminNotes } : { status }
        ),
      });
      onNotify(`Status peminjaman ${schedule.venue} diubah ke ${status}.`);
      await onRefresh();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Gagal memperbarui status.', 'error');
    }
  };

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewSchedule) return;
    setReviewSaving(true);
    try {
      await handleStatusChange(reviewSchedule, reviewStatus, reviewNotes.trim());
      setReviewSchedule(null);
    } finally {
      setReviewSaving(false);
    }
  };

  const handleDelete = async (schedule: LabSchedule) => {
    try {
      await apiFetch(`/api/schedules/${schedule.id}`, { method: 'DELETE' });
      onNotify('Jadwal peminjaman ruangan dihapus.');
      if (detailSchedule?.id === schedule.id) {
        setDetailSchedule(null);
      }
      await onRefresh();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Gagal menghapus jadwal.', 'error');
    }
  };

  const parsedFormParticipants = Math.max(0, Number(participantCount) || 0);
  const selectedVenueCapacity = SCHEDULE_VENUE_META[venue].capacity;
  const exceedsCapacity = parsedFormParticipants > selectedVenueCapacity;
  const multiDaySpan = countDaysInclusive(date, endDate >= date ? endDate : date);

  return (
    <div className="space-y-5">
      {/* Header & View Mode Switcher */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">
            Penjadwalan Peminjaman Aula & Multimedia
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Cek slot kosong harian, ajukan peminjaman multi-hari atau berulang, kelola perlengkapan, dan pantau bentrok waktu per ruangan.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 self-start lg:self-auto">
          <div className="flex items-center p-1 bg-slate-200/60 rounded-xl">
            <button
              type="button"
              onClick={() => setViewMode('timeline')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'timeline'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              Timeline Harian
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
          </div>
          <button
            type="button"
            onClick={() => openCreateWithPreset()}
            className="px-4 py-2.5 rounded-xl bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-sm font-semibold inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <Plus className="w-4 h-4" />
            Ajukan Peminjaman
          </button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white rounded-2xl border border-slate-200/90 px-4 py-3.5">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Jadwal Ruang Aula</span>
            <span className="font-mono text-[11px] text-indigo-600">
              Kap. {SCHEDULE_VENUE_META.Aula.capacity}
            </span>
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-indigo-700 mt-0.5">
            {stats.aulaCount}
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200/90 px-4 py-3.5">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Jadwal Ruang Multimedia</span>
            <span className="font-mono text-[11px] text-sky-600">
              Kap. {SCHEDULE_VENUE_META.Multimedia.capacity}
            </span>
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-sky-700 mt-0.5">
            {stats.multimediaCount}
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200/90 px-4 py-3.5">
          <div className="text-xs text-slate-500">Menunggu Konfirmasi</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-amber-600 mt-0.5">
            {stats.waiting}
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200/90 px-4 py-3.5">
          <div className="text-xs text-slate-500">Disetujui / Bentrok</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-0.5">
            <span className="text-emerald-700">{stats.approved}</span>
            <span className="text-slate-300 mx-1.5">/</span>
            <span className={conflictMap.size > 0 ? 'text-rose-600' : 'text-slate-400'}>
              {conflictMap.size}
            </span>
          </div>
        </div>
      </div>

      {/* Requester Conflict Notification Banner */}
      {myConflicts.length > 0 && (
        <div className="rounded-2xl bg-rose-50 border border-rose-200 p-4 space-y-2.5">
          <div className="flex items-center gap-2 text-rose-800">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <h3 className="text-sm font-bold">
              Notifikasi Bentrok Waktu pada Pengajuan Anda ({myConflicts.length})
            </h3>
          </div>
          <div className="divide-y divide-rose-200/70">
            {myConflicts.map((item) => {
              const s = item.schedule;
              const other = item.conflictsWith[0];
              const canEditRow = isAdmin || s.status === 'Menunggu';
              return (
                <div
                  key={item.key}
                  className="py-2 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-rose-800"
                >
                  <div>
                    <span className="font-semibold">
                      Ruang {s.venue} · {formatDateRangeLabel(s)} ({s.startTime}–{s.endTime})
                    </span>{' '}
                    — <span>{s.activity}</span>{' '}
                    <span className="text-rose-700">
                      bentrok dengan <strong>{other.activity}</strong> ({formatDateRangeLabel(other)}{' '}
                      {other.startTime}–{other.endTime}, {other.requesterName})
                    </span>
                  </div>
                  {canEditRow && (
                    <button
                      type="button"
                      onClick={() => openEdit(s)}
                      className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-semibold shrink-0 self-start sm:self-auto cursor-pointer"
                    >
                      Ubah Jam / Ruangan
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Search, Venue, Scope & Status Filters */}
      <div className="space-y-2.5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari kegiatan, peminjam, perlengkapan..."
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-white border border-slate-200 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#2563eb]"
              />
            </div>

            <div className="flex items-center gap-1 p-1 bg-slate-200/60 rounded-xl">
              {(['ALL', ...SCHEDULE_VENUES] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setVenueFilter(v)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                    venueFilter === v
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {v === 'ALL' ? 'Semua Ruangan' : v}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-200/60 rounded-xl w-fit">
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
                  {st === 'ALL' ? 'Semua Status' : st}
                </button>
              ))}
            </div>

            {viewMode !== 'timeline' && (
              <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-200/60 rounded-xl w-fit">
                {(
                  [
                    { id: 'ALL', label: 'Semua Tanggal' },
                    { id: 'TODAY', label: 'Hari Ini' },
                    { id: 'WEEK', label: '7 Hari' },
                    { id: 'CONFLICTS', label: 'Bentrok' },
                  ] as const
                ).map((sc) => (
                  <button
                    key={sc.id}
                    type="button"
                    onClick={() => setScopeFilter(sc.id)}
                    className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                      scopeFilter === sc.id
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {sc.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* VIEW 1: DAILY TIMELINE (SIDE-BY-SIDE AULA & MULTIMEDIA) */}
      {viewMode === 'timeline' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200/90 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setTimelineDate((d) => shiftIsoDate(d, -1))}
                title="Hari Sebelumnya"
                className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <input
                type="date"
                value={timelineDate}
                onChange={(e) => setTimelineDate(e.target.value || today)}
                className="px-3 py-1.5 rounded-xl border border-slate-200 text-sm font-mono font-semibold text-slate-900"
              />
              <button
                type="button"
                onClick={() => setTimelineDate((d) => shiftIsoDate(d, 1))}
                title="Hari Berikutnya"
                className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setTimelineDate(today)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border cursor-pointer ${
                  timelineDate === today
                    ? 'bg-blue-50 text-blue-700 border-blue-200'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                Hari Ini
              </button>
            </div>
            <div className="text-xs text-slate-500">
              Klik slot kosong di bawah setiap ruangan untuk langsung mengajukan peminjaman pada jam tersebut.
            </div>
          </div>

          <div
            className={`grid gap-4 ${
              timelineVenues.length > 1 ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'
            }`}
          >
            {timelineVenues.map((v) => {
              const meta = SCHEDULE_VENUE_META[v];
              const dayBookings = filtered
                .filter((s) => s.venue === v && scheduleCoversDate(s, timelineDate))
                .sort((a, b) => a.startTime.localeCompare(b.startTime));
              const freeSlots = getFreeSlotsForDate(
                schedules,
                v,
                timelineDate,
                undefined,
                '07:00',
                '17:00'
              );
              const isAula = v === 'Aula';

              return (
                <div
                  key={v}
                  className="bg-white rounded-2xl border border-slate-200/90 overflow-hidden flex flex-col"
                >
                  <div
                    className={`px-5 py-4 border-b border-slate-200/80 ${
                      isAula ? 'bg-indigo-50/50' : 'bg-sky-50/50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div
                          className={`p-2.5 rounded-xl border shrink-0 ${
                            isAula
                              ? 'bg-indigo-100/80 text-indigo-700 border-indigo-200'
                              : 'bg-sky-100/80 text-sky-700 border-sky-200'
                          }`}
                        >
                          {isAula ? (
                            <Building2 className="w-5 h-5" />
                          ) : (
                            <MonitorPlay className="w-5 h-5" />
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-base font-bold text-slate-900">Ruang {v}</h3>
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-white border border-slate-200 text-slate-700">
                              <Users className="w-3 h-3" />
                              Kap. {meta.capacity} org
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5">{meta.subtitle}</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => openCreateWithPreset({ venue: v, date: timelineDate })}
                        className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-800 inline-flex items-center gap-1 shrink-0 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Pinjam
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {meta.defaultFacilities.map((fac) => (
                        <span
                          key={fac}
                          className="px-2 py-0.5 rounded-md bg-white/90 border border-slate-200/80 text-[11px] text-slate-600"
                        >
                          {fac}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Bookings on timelineDate */}
                  <div className="p-4 space-y-3 flex-1">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                        Jadwal Terdaftar ({dayBookings.length})
                      </h4>
                      <span className="text-[11px] font-mono text-slate-400">{timelineDate}</span>
                    </div>

                    {dayBookings.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-500">
                        Belum ada peminjaman Ruang {v} pada tanggal ini.
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        {dayBookings.map((s) => {
                          const conflicts = conflictMap.get(s.id) ?? [];
                          const isOwnerPending =
                            s.requesterId === profile.uid && s.status === 'Menunggu';
                          const canEdit = isAdmin || isOwnerPending;
                          return (
                            <div
                              key={s.id}
                              onClick={() => setDetailSchedule(s)}
                              className={`rounded-xl border p-3 transition-colors cursor-pointer ${
                                conflicts.length > 0
                                  ? 'border-rose-300 bg-rose-50/40 hover:bg-rose-50/70'
                                  : 'border-slate-200 bg-slate-50/50 hover:bg-slate-50'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <span className="font-mono text-xs font-bold text-slate-900">
                                      {s.startTime}–{s.endTime}
                                    </span>
                                    {s.lessonPeriod && (
                                      <span className="px-1.5 py-0.5 rounded bg-slate-200/70 text-[10px] font-semibold text-slate-700">
                                        {s.lessonPeriod}
                                      </span>
                                    )}
                                    {effectiveEndDate(s) > s.date && (
                                      <span className="px-1.5 py-0.5 rounded bg-indigo-50 border border-indigo-200 text-[10px] font-semibold text-indigo-700">
                                        Multi-hari ({formatDateRangeLabel(s)})
                                      </span>
                                    )}
                                  </div>
                                  <div className="font-semibold text-sm text-slate-900 mt-1">
                                    {s.activity}
                                  </div>
                                  <div className="text-xs text-slate-500 mt-0.5">
                                    {s.requesterName} ({s.unit})
                                    {s.setupType ? ` · ${s.setupType}` : ''}
                                    {s.participantCount > 0
                                      ? ` · ${s.participantCount} peserta`
                                      : ''}
                                  </div>
                                  {s.equipmentNeeds && (
                                    <div className="text-[11px] text-slate-600 mt-1 flex items-center gap-1">
                                      <Wrench className="w-3 h-3 text-slate-400 shrink-0" />
                                      <span className="truncate">{s.equipmentNeeds}</span>
                                    </div>
                                  )}
                                  {conflicts.length > 0 && (
                                    <div className="text-[11px] font-semibold text-rose-600 mt-1 flex items-center gap-1">
                                      <AlertTriangle className="w-3 h-3 shrink-0" />
                                      Bentrok dengan {conflicts[0].activity} (
                                      {conflicts[0].startTime}–{conflicts[0].endTime})
                                    </div>
                                  )}
                                </div>

                                <div
                                  className="flex flex-col items-end gap-1.5 shrink-0"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <span
                                    className={`px-2 py-0.5 rounded-md border text-[11px] font-semibold ${statusBadgeClass(
                                      s.status
                                    )}`}
                                  >
                                    {s.status}
                                  </span>
                                  <div className="inline-flex items-center gap-1">
                                    {isAdmin && s.status === 'Menunggu' && (
                                      <button
                                        type="button"
                                        onClick={() => openReviewModal(s, 'Disetujui')}
                                        title="Tinjau / Setujui"
                                        className="p-1 rounded-lg text-emerald-600 hover:bg-emerald-50 cursor-pointer"
                                      >
                                        <Check className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                    {canEdit && (
                                      <button
                                        type="button"
                                        onClick={() => openEdit(s)}
                                        title="Edit"
                                        className="p-1 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 cursor-pointer"
                                      >
                                        <Pencil className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Available Free Slots */}
                  <div className="px-4 py-3.5 bg-slate-50/70 border-t border-slate-200/80">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-600 mb-2">
                      <Clock className="w-3.5 h-3.5 text-emerald-600" />
                      Slot Kosong Tersedia (07:00 – 17:00)
                    </div>
                    {freeSlots.length === 0 ? (
                      <div className="text-xs text-slate-500">
                        Seluruh slot jam kerja pada tanggal ini sudah terisi.
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {freeSlots.map((slot) => (
                          <button
                            key={`${slot.startTime}-${slot.endTime}`}
                            type="button"
                            onClick={() =>
                              openCreateWithPreset({
                                venue: v,
                                date: timelineDate,
                                startTime: slot.startTime,
                                endTime: slot.endTime,
                                lessonPeriod: 'Waktu Kustom',
                              })
                            }
                            className="px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 text-xs font-mono font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer"
                          >
                            <Plus className="w-3 h-3" />
                            {slot.startTime}–{slot.endTime}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* VIEW 2: AGENDA BOARD */}
      {viewMode === 'agenda' && (
        <div className="space-y-4">
          {groupedByDate.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200/90 p-10 text-center text-sm text-slate-500">
              Tidak ada agenda peminjaman Aula atau Multimedia yang sesuai.
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
                  <span className="text-xs text-slate-500">{items.length} kegiatan</span>
                </div>
                <div className="divide-y divide-slate-100">
                  {items.map((s) => {
                    const itemConflicts = conflictMap.get(s.id) ?? [];
                    const isOwnerPending =
                      s.requesterId === profile.uid && s.status === 'Menunggu';
                    const canEdit = isAdmin || isOwnerPending;
                    return (
                      <div
                        key={s.id}
                        className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-start justify-between gap-3 hover:bg-slate-50/50"
                      >
                        <div className="flex items-start gap-3 sm:gap-4 min-w-0">
                          <div className="font-mono text-xs font-semibold text-slate-700 shrink-0 pt-0.5">
                            <div>
                              {s.startTime} – {s.endTime}
                            </div>
                            {effectiveEndDate(s) > s.date && (
                              <div className="text-[10px] text-indigo-600 mt-0.5">
                                s/d {effectiveEndDate(s)}
                              </div>
                            )}
                          </div>
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold border shrink-0 ${
                              s.venue === 'Aula'
                                ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                : 'bg-sky-50 text-sky-700 border-sky-200'
                            }`}
                          >
                            {s.venue}
                          </span>
                          <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-semibold text-slate-900 text-sm">
                                {s.activity}
                              </span>
                              {s.setupType && (
                                <span className="px-2 py-0.5 rounded-md bg-slate-100 text-[11px] font-medium text-slate-700">
                                  {s.setupType}
                                </span>
                              )}
                              {s.participantCount > 0 && (
                                <span className="inline-flex items-center gap-1 text-[11px] text-slate-600">
                                  <Users className="w-3 h-3" />
                                  {s.participantCount} org
                                </span>
                              )}
                              {s.lessonPeriod && (
                                <span className="text-[11px] text-slate-500">
                                  · {s.lessonPeriod}
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-500">
                              {s.requesterName} · {s.requesterRole} · {s.unit}
                              {itemConflicts.length > 0 && (
                                <span className="ml-2 text-rose-600 font-semibold">
                                  · Bentrok dengan {itemConflicts[0].activity} (
                                  {itemConflicts[0].startTime}–{itemConflicts[0].endTime})
                                </span>
                              )}
                            </div>
                            {s.equipmentNeeds && (
                              <div className="text-xs text-slate-600">
                                Perlengkapan: {s.equipmentNeeds}
                              </div>
                            )}
                            {s.adminNotes && (
                              <div className="text-xs text-indigo-700 bg-indigo-50/70 rounded-lg px-2.5 py-1 inline-block">
                                Catatan Admin: {s.adminNotes}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span
                            className={`px-2.5 py-1 rounded-lg border text-xs font-semibold ${statusBadgeClass(
                              s.status
                            )}`}
                          >
                            {s.status}
                          </span>
                          <button
                            type="button"
                            onClick={() => setDetailSchedule(s)}
                            title="Detail"
                            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 cursor-pointer"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => openDuplicate(s)}
                            title="Duplikat / Ajukan Ulang"
                            className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 cursor-pointer"
                          >
                            <Copy className="w-4 h-4" />
                          </button>
                          {canEdit && (
                            <button
                              type="button"
                              onClick={() => openEdit(s)}
                              title="Edit"
                              className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 cursor-pointer"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* VIEW 3: TABLE */}
      {viewMode === 'table' && (
        <div className="bg-white rounded-2xl border border-slate-200/90 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Ruangan</th>
                  <th className="px-4 py-3 font-semibold">Tanggal & Jam</th>
                  <th className="px-4 py-3 font-semibold">Kegiatan & Perlengkapan</th>
                  <th className="px-4 py-3 font-semibold">Penanggung Jawab</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                      Tidak ada jadwal peminjaman Aula atau Multimedia yang sesuai.
                    </td>
                  </tr>
                ) : (
                  filtered.map((s) => {
                    const isOwnerPending =
                      s.requesterId === profile.uid && s.status === 'Menunggu';
                    const canEdit = isAdmin || isOwnerPending;
                    const canDelete = isAdmin || isOwnerPending;
                    const conflicts = conflictMap.get(s.id) ?? [];
                    const hasConflict = conflicts.length > 0;

                    return (
                      <tr key={s.id} className="hover:bg-slate-50/70 align-top">
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border ${
                              s.venue === 'Aula'
                                ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                : 'bg-sky-50 text-sky-700 border-sky-200'
                            }`}
                          >
                            {s.venue === 'Aula' ? (
                              <Building2 className="w-3.5 h-3.5" />
                            ) : (
                              <MonitorPlay className="w-3.5 h-3.5" />
                            )}
                            {s.venue}
                          </span>
                          {s.participantCount > 0 && (
                            <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
                              <Users className="w-3 h-3" />
                              {s.participantCount} peserta
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-700 whitespace-nowrap">
                          <div className="font-semibold text-slate-900">
                            {formatDateRangeLabel(s)}
                          </div>
                          <div className="text-slate-500">
                            {s.startTime} – {s.endTime}
                          </div>
                          {s.lessonPeriod && (
                            <div className="font-sans text-[11px] text-slate-500 mt-0.5">
                              {s.lessonPeriod}
                            </div>
                          )}
                          {hasConflict && (
                            <div className="font-sans text-[11px] font-semibold text-rose-600 mt-0.5">
                              Bentrok: {conflicts[0].activity} ({conflicts[0].startTime}–
                              {conflicts[0].endTime})
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 min-w-[200px]">
                          <div className="font-medium text-slate-900">{s.activity}</div>
                          {s.setupType && (
                            <div className="text-xs text-slate-500 mt-0.5">{s.setupType}</div>
                          )}
                          {s.equipmentNeeds && (
                            <div className="text-[11px] text-slate-600 mt-1">
                              Alat: {s.equipmentNeeds}
                            </div>
                          )}
                          {s.adminNotes && (
                            <div className="text-[11px] text-indigo-700 mt-1">
                              Admin: {s.adminNotes}
                            </div>
                          )}
                        </td>
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
                              className={`inline-block px-2 py-0.5 rounded-md border text-xs font-semibold ${statusBadgeClass(
                                s.status
                              )}`}
                            >
                              {s.status}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setDetailSchedule(s)}
                              title="Lihat Detail"
                              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 cursor-pointer"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => openDuplicate(s)}
                              title="Duplikat / Ajukan Ulang"
                              className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 cursor-pointer"
                            >
                              <Copy className="w-4 h-4" />
                            </button>
                            {isAdmin && (
                              <>
                                {s.status === 'Menunggu' && (
                                  <button
                                    type="button"
                                    onClick={() => handleStatusChange(s, 'Disetujui')}
                                    title="Setujui Cepat"
                                    className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 cursor-pointer"
                                  >
                                    <Check className="w-4 h-4" />
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => openReviewModal(s)}
                                  title="Tinjau & Beri Catatan Admin"
                                  className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 cursor-pointer"
                                >
                                  <MessageSquareText className="w-4 h-4" />
                                </button>
                              </>
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
      )}

      {/* CREATE / EDIT MODAL */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
              <div>
                <h3 className="font-bold text-slate-900">
                  {editingSchedule
                    ? 'Edit Jadwal Peminjaman Ruangan'
                    : 'Ajukan Peminjaman Aula / Multimedia'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Mendukung peminjaman multi-hari, sesi preset, jadwal berulang, dan daftar perlengkapan.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto">
              {/* Room Selection */}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Pilih Ruangan *
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {SCHEDULE_VENUES.map((v) => {
                    const selected = venue === v;
                    const meta = SCHEDULE_VENUE_META[v];
                    return (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setVenue(v)}
                        className={`p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                          selected
                            ? v === 'Aula'
                              ? 'bg-indigo-50 border-indigo-500 text-indigo-900'
                              : 'bg-sky-50 border-sky-500 text-sky-900'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-bold inline-flex items-center gap-1.5">
                            {v === 'Aula' ? (
                              <Building2 className="w-4 h-4" />
                            ) : (
                              <MonitorPlay className="w-4 h-4" />
                            )}
                            Ruang {v}
                          </span>
                          <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded bg-white/80 border border-slate-200/80">
                            Maks {meta.capacity} org
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-1 line-clamp-1">
                          {meta.subtitle}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Smart Conflict Resolution Box */}
              {formConflicts.length > 0 && (
                <div className="rounded-xl bg-rose-50 border border-rose-200 p-3.5 text-xs text-rose-800 space-y-2.5">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                    <div>
                      <div className="font-bold">
                        Terdeteksi {formConflicts.length} bentrok waktu pada Ruang {venue}:
                      </div>
                      <ul className="mt-1 space-y-0.5 list-disc list-inside text-rose-700">
                        {formConflicts.slice(0, 3).map((c) => (
                          <li key={c.id}>
                            <strong>{c.activity}</strong> ({formatDateRangeLabel(c)},{' '}
                            {c.startTime}–{c.endTime}, {c.requesterName} · {c.status})
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-rose-200/70">
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-900">
                      <Sparkles className="w-3.5 h-3.5" />
                      Solusi Cepat:
                    </span>
                    {alternativeVenue && (
                      <button
                        type="button"
                        onClick={() => setVenue(alternativeVenue)}
                        className="px-2.5 py-1 rounded-lg bg-white hover:bg-indigo-50 border border-indigo-300 text-indigo-700 font-semibold text-[11px] cursor-pointer"
                      >
                        Pindah ke Ruang {alternativeVenue} (Kosong)
                      </button>
                    )}
                    {formFreeSlots.slice(0, 3).map((slot) => (
                      <button
                        key={`${slot.startTime}-${slot.endTime}`}
                        type="button"
                        onClick={() => {
                          setStartTime(slot.startTime);
                          setEndTime(slot.endTime);
                          setLessonPeriod('Waktu Kustom');
                        }}
                        className="px-2.5 py-1 rounded-lg bg-white hover:bg-emerald-50 border border-emerald-300 text-emerald-700 font-mono font-semibold text-[11px] cursor-pointer"
                      >
                        Pakai {slot.startTime}–{slot.endTime}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Date Range */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Tanggal Mulai *
                  </label>
                  <input
                    type="date"
                    required
                    value={date}
                    onChange={(e) => handleStartDateChange(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Tanggal Selesai *{' '}
                    {multiDaySpan > 1 && (
                      <span className="ml-1 text-indigo-600 font-semibold">
                        ({multiDaySpan} hari)
                      </span>
                    )}
                  </label>
                  <input
                    type="date"
                    required
                    min={date}
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value >= date ? e.target.value : date)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                  />
                </div>
              </div>

              {/* Session Preset + Start/End Time */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Preset Sesi / Jam Pelajaran
                  </label>
                  <select
                    value={lessonPeriod}
                    onChange={(e) => handleSessionPresetChange(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white"
                  >
                    {SESSION_PRESETS.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
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

              {/* Recurrence Options (Create Only) */}
              {!editingSchedule && (
                <div className="rounded-xl bg-slate-50 border border-slate-200/80 p-3 space-y-2.5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                      <Repeat className="w-3.5 h-3.5 text-indigo-600" />
                      Jadwal Berulang (Opsional)
                    </div>
                    <div className="flex items-center gap-2">
                      <select
                        value={recurrence}
                        onChange={(e) => setRecurrence(e.target.value as RecurrenceMode)}
                        className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-medium bg-white"
                      >
                        <option value="NONE">Sekali Pakai</option>
                        <option value="DAILY">Ulangi Harian</option>
                        <option value="WEEKLY">Ulangi Mingguan</option>
                      </select>
                      {recurrence !== 'NONE' && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-slate-500">Jumlah:</span>
                          <input
                            type="number"
                            min={2}
                            max={8}
                            value={recurrenceCount}
                            onChange={(e) =>
                              setRecurrenceCount(
                                Math.max(2, Math.min(8, Number(e.target.value) || 2))
                              )
                            }
                            className="w-16 px-2 py-1 rounded-lg border border-slate-200 text-xs bg-white font-mono"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                  {recurrence !== 'NONE' && (
                    <div className="flex flex-wrap gap-1.5">
                      {slotConflictPreviews.map((item, idx) => {
                        const hasErr = item.conflicts.length > 0;
                        return (
                          <span
                            key={`${item.date}-${idx}`}
                            className={`px-2 py-1 rounded-lg border text-[11px] font-mono inline-flex items-center gap-1 ${
                              hasErr
                                ? 'bg-rose-50 border-rose-200 text-rose-700'
                                : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                            }`}
                          >
                            <CalendarRange className="w-3 h-3" />
                            {item.endDate > item.date
                              ? `${item.date}..${item.endDate}`
                              : item.date}
                            {hasErr ? ' (Bentrok)' : ' (Kosong)'}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Activity, Setup Type & Participant Count */}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Nama Kegiatan / Acara *
                </label>
                <input
                  type="text"
                  required
                  maxLength={120}
                  value={activity}
                  onChange={(e) => setActivity(e.target.value)}
                  placeholder={
                    venue === 'Aula'
                      ? 'cth. Rapat Koordinasi / Sosialisasi Program Sekolah'
                      : 'cth. Praktikum Desain Multimedia / Presentasi Video'
                  }
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Jenis Kegiatan / Tata Ruang
                  </label>
                  <select
                    value={setupType}
                    onChange={(e) => setSetupType(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white"
                  >
                    {SCHEDULE_SETUP_TYPES.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Perkiraan Jumlah Peserta (Maks. {selectedVenueCapacity})
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={2000}
                    value={participantCount}
                    onChange={(e) => setParticipantCount(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm font-mono"
                  />
                </div>
              </div>

              {exceedsCapacity && (
                <div className="rounded-xl bg-amber-50 border border-amber-200 px-3.5 py-2.5 text-xs text-amber-800 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                  <span>
                    Perkiraan <strong>{parsedFormParticipants}</strong> peserta melebihi kapasitas ideal{' '}
                    <strong>Ruang {venue}</strong> ({selectedVenueCapacity} orang). Pertimbangkan memilih{' '}
                    {venue === 'Multimedia' ? 'Ruang Aula' : 'penyesuaian sesi / kursi tambahan'}.
                  </span>
                </div>
              )}

              {/* Equipment Checklist */}
              <div className="space-y-2">
                <label className="block text-xs font-medium text-slate-700">
                  Perlengkapan & Dukungan Teknis yang Dibutuhkan
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {SCHEDULE_EQUIPMENT_OPTIONS.map((item) => {
                    const active = selectedEquipment.includes(item);
                    return (
                      <button
                        key={item}
                        type="button"
                        onClick={() => toggleEquipmentChip(item)}
                        className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
                          active
                            ? 'bg-blue-50 border-blue-400 text-blue-800 font-semibold'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        {active ? '✓ ' : '+ '}
                        {item}
                      </button>
                    );
                  })}
                </div>
                <input
                  type="text"
                  maxLength={140}
                  value={customEquipment}
                  onChange={(e) => setCustomEquipment(e.target.value)}
                  placeholder="Perlengkapan tambahan lain (pisahkan dengan koma, cth. Kabel HDMI 10m, Meja Registrasi)"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs"
                />
              </div>

              {/* Requester Info */}
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

              {/* Borrower Notes */}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Catatan Tambahan Peminjam (Opsional)
                </label>
                <textarea
                  rows={2}
                  maxLength={300}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="cth. Mohon penataan kursi model teater dan uji mikrofon 15 menit sebelum acara."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm resize-none"
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
                  {saving
                    ? 'Menyimpan...'
                    : editingSchedule
                      ? 'Simpan Perubahan'
                      : recurrence !== 'NONE' && generatedRecurrenceSlots.length > 1
                        ? `Ajukan ${generatedRecurrenceSlots.length} Jadwal`
                        : 'Ajukan Jadwal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DETAIL MODAL */}
      {detailSchedule && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border ${
                    detailSchedule.venue === 'Aula'
                      ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                      : 'bg-sky-50 text-sky-700 border-sky-200'
                  }`}
                >
                  {detailSchedule.venue === 'Aula' ? (
                    <Building2 className="w-3.5 h-3.5" />
                  ) : (
                    <MonitorPlay className="w-3.5 h-3.5" />
                  )}
                  Ruang {detailSchedule.venue}
                </span>
                <span
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold border ${statusBadgeClass(
                    detailSchedule.status
                  )}`}
                >
                  {detailSchedule.status}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setDetailSchedule(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-3.5 text-sm">
              <div>
                <div className="text-xs text-slate-500">Kegiatan / Acara</div>
                <div className="text-base font-bold text-slate-900 mt-0.5">
                  {detailSchedule.activity}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 rounded-xl p-3 border border-slate-200/80">
                <div>
                  <div className="text-slate-500">Tanggal</div>
                  <div className="font-mono font-semibold text-slate-900 mt-0.5">
                    {formatDateRangeLabel(detailSchedule)}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">Waktu</div>
                  <div className="font-mono font-semibold text-slate-900 mt-0.5">
                    {detailSchedule.startTime} – {detailSchedule.endTime}
                    {detailSchedule.lessonPeriod ? ` (${detailSchedule.lessonPeriod})` : ''}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">Jenis & Peserta</div>
                  <div className="font-semibold text-slate-900 mt-0.5">
                    {detailSchedule.setupType || '-'}
                    {detailSchedule.participantCount > 0
                      ? ` · ${detailSchedule.participantCount} peserta`
                      : ''}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">Penanggung Jawab</div>
                  <div className="font-semibold text-slate-900 mt-0.5">
                    {detailSchedule.requesterName} ({detailSchedule.requesterRole} ·{' '}
                    {detailSchedule.unit})
                  </div>
                </div>
              </div>

              {detailSchedule.equipmentNeeds && (
                <div className="text-xs">
                  <div className="text-slate-500 font-medium mb-1">Perlengkapan Diminta</div>
                  <div className="text-slate-800 bg-slate-50 rounded-xl px-3 py-2 border border-slate-200/80">
                    {detailSchedule.equipmentNeeds}
                  </div>
                </div>
              )}

              {detailSchedule.notes && (
                <div className="text-xs">
                  <div className="text-slate-500 font-medium mb-1">Catatan Peminjam</div>
                  <div className="text-slate-800 bg-slate-50 rounded-xl px-3 py-2 border border-slate-200/80">
                    {detailSchedule.notes}
                  </div>
                </div>
              )}

              {detailSchedule.adminNotes && (
                <div className="text-xs">
                  <div className="text-indigo-700 font-medium mb-1">Catatan Admin</div>
                  <div className="text-indigo-900 bg-indigo-50 rounded-xl px-3 py-2 border border-indigo-200">
                    {detailSchedule.adminNotes}
                  </div>
                </div>
              )}

              {(conflictMap.get(detailSchedule.id)?.length ?? 0) > 0 && (
                <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800">
                  <div className="font-bold flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Bentrok Jadwal Terdeteksi
                  </div>
                  <ul className="mt-1 space-y-0.5 list-disc list-inside">
                    {(conflictMap.get(detailSchedule.id) ?? []).map((c) => (
                      <li key={c.id}>
                        {c.activity} ({formatDateRangeLabel(c)}, {c.startTime}–{c.endTime},{' '}
                        {c.requesterName})
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="pt-2 flex flex-wrap justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    const target = detailSchedule;
                    setDetailSchedule(null);
                    openDuplicate(target);
                  }}
                  className="px-3.5 py-2 rounded-xl text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Duplikat
                </button>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => {
                      const target = detailSchedule;
                      setDetailSchedule(null);
                      openReviewModal(target);
                    }}
                    className="px-3.5 py-2 rounded-xl text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <MessageSquareText className="w-3.5 h-3.5" />
                    Tinjau & Catatan
                  </button>
                )}
                {(isAdmin ||
                  (detailSchedule.requesterId === profile.uid &&
                    detailSchedule.status === 'Menunggu')) && (
                  <button
                    type="button"
                    onClick={() => {
                      const target = detailSchedule;
                      setDetailSchedule(null);
                      openEdit(target);
                    }}
                    className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-[#2563eb] hover:bg-[#1d4ed8] text-white inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    Edit
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ADMIN REVIEW & NOTES MODAL */}
      {reviewSchedule && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h3 className="font-bold text-slate-900">Tinjau Pengajuan Ruang {reviewSchedule.venue}</h3>
              <button
                type="button"
                onClick={() => setReviewSchedule(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleReviewSubmit} className="p-5 space-y-4">
              <div className="rounded-xl bg-slate-50 border border-slate-200/80 p-3 text-xs space-y-1">
                <div className="font-bold text-slate-900">{reviewSchedule.activity}</div>
                <div className="text-slate-600">
                  {formatDateRangeLabel(reviewSchedule)} · {reviewSchedule.startTime}–
                  {reviewSchedule.endTime} · {reviewSchedule.requesterName} ({reviewSchedule.unit})
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Keputusan Status
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {SCHEDULE_STATUSES.map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setReviewStatus(st)}
                      className={`px-3 py-2 rounded-xl border text-xs font-semibold cursor-pointer ${
                        reviewStatus === st
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Catatan Admin untuk Peminjam (Opsional)
                </label>
                <textarea
                  rows={3}
                  maxLength={300}
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  placeholder="cth. Disetujui. Kunci ruang dapat diambil di ruang teknisi pukul 07:00."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm resize-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setReviewSchedule(null)}
                  className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={reviewSaving}
                  className="px-4 py-2 rounded-xl text-sm font-semibold bg-[#2563eb] hover:bg-[#1d4ed8] disabled:opacity-60 text-white cursor-pointer"
                >
                  {reviewSaving ? 'Menyimpan...' : 'Simpan Keputusan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
