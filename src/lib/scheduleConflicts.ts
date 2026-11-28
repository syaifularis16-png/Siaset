import type { LabSchedule, ScheduleVenue } from '../types';

export interface ScheduleConflictNotification {
  key: string;
  schedule: LabSchedule;
  conflictsWith: LabSchedule[];
}

export function effectiveEndDate(s: Pick<LabSchedule, 'date' | 'endDate'>): string {
  if (s.endDate && s.endDate >= s.date) return s.endDate;
  return s.date;
}

export function scheduleCoversDate(
  s: Pick<LabSchedule, 'date' | 'endDate'>,
  targetDate: string
): boolean {
  if (!s.date || !targetDate) return false;
  return s.date <= targetDate && effectiveEndDate(s) >= targetDate;
}

export function dateRangesOverlap(
  aStartDate: string,
  aEndDate: string,
  bStartDate: string,
  bEndDate: string
): boolean {
  if (!aStartDate || !bStartDate) return false;
  const aEnd = aEndDate && aEndDate >= aStartDate ? aEndDate : aStartDate;
  const bEnd = bEndDate && bEndDate >= bStartDate ? bEndDate : bStartDate;
  return aStartDate <= bEnd && aEnd >= bStartDate;
}

export function timeRangesOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string
): boolean {
  if (!aStart || !aEnd || !bStart || !bEnd) return false;
  return aStart < bEnd && aEnd > bStart;
}

export function isActiveScheduleStatus(status: LabSchedule['status']): boolean {
  return status === 'Menunggu' || status === 'Disetujui';
}

export function buildConflictMap(schedules: LabSchedule[]): Map<string, LabSchedule[]> {
  const map = new Map<string, LabSchedule[]>();
  const active = schedules.filter((s) => isActiveScheduleStatus(s.status));

  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i];
      const b = active[j];
      if (
        a.venue === b.venue &&
        dateRangesOverlap(a.date, a.endDate, b.date, b.endDate) &&
        timeRangesOverlap(a.startTime, a.endTime, b.startTime, b.endTime)
      ) {
        const listA = map.get(a.id) ?? [];
        listA.push(b);
        map.set(a.id, listA);

        const listB = map.get(b.id) ?? [];
        listB.push(a);
        map.set(b.id, listB);
      }
    }
  }

  return map;
}

export function findConflictsForSlot(
  schedules: LabSchedule[],
  slot: {
    venue: ScheduleVenue;
    date: string;
    endDate?: string;
    startTime: string;
    endTime: string;
    excludeId?: string;
  }
): LabSchedule[] {
  if (!slot.venue || !slot.date || !slot.startTime || !slot.endTime) return [];
  const slotEndDate = slot.endDate && slot.endDate >= slot.date ? slot.endDate : slot.date;
  return schedules.filter((s) => {
    if (slot.excludeId && s.id === slot.excludeId) return false;
    if (!isActiveScheduleStatus(s.status)) return false;
    if (s.venue !== slot.venue) return false;
    if (!dateRangesOverlap(slot.date, slotEndDate, s.date, s.endDate)) return false;
    return timeRangesOverlap(slot.startTime, slot.endTime, s.startTime, s.endTime);
  });
}

export function getUserScheduleConflictNotifications(
  schedules: LabSchedule[],
  uid: string
): ScheduleConflictNotification[] {
  if (!uid) return [];
  const conflictMap = buildConflictMap(schedules);
  const items: ScheduleConflictNotification[] = [];

  for (const s of schedules) {
    if (s.requesterId !== uid) continue;
    const conflictsWith = conflictMap.get(s.id);
    if (!conflictsWith || conflictsWith.length === 0) continue;
    const sortedOthers = [...conflictsWith].sort((a, b) =>
      `${a.date}${a.startTime}${a.id}`.localeCompare(`${b.date}${b.startTime}${b.id}`)
    );
    const otherSig = sortedOthers.map((o) => o.id).join(',');
    items.push({
      key: `${s.id}:${s.date}:${effectiveEndDate(s)}:${s.startTime}-${s.endTime}:${s.venue}:${otherSig}`,
      schedule: s,
      conflictsWith: sortedOthers,
    });
  }

  return items.sort((a, b) =>
    `${a.schedule.date}${a.schedule.startTime}`.localeCompare(
      `${b.schedule.date}${b.schedule.startTime}`
    )
  );
}

function toMinutes(hm: string): number {
  const [h, m] = hm.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return h * 60 + m;
}

function fromMinutes(mins: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, Math.round(mins)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export interface FreeTimeSlot {
  startTime: string;
  endTime: string;
}

export function getFreeSlotsForDate(
  schedules: LabSchedule[],
  venue: ScheduleVenue,
  targetDate: string,
  excludeId?: string,
  dayStart = '07:00',
  dayEnd = '17:00'
): FreeTimeSlot[] {
  const startMin = toMinutes(dayStart);
  const endMin = toMinutes(dayEnd);
  if (endMin <= startMin) return [];

  const intervals = schedules
    .filter((s) => {
      if (excludeId && s.id === excludeId) return false;
      if (!isActiveScheduleStatus(s.status)) return false;
      if (s.venue !== venue) return false;
      return scheduleCoversDate(s, targetDate);
    })
    .map((s) => ({
      start: Math.max(startMin, toMinutes(s.startTime)),
      end: Math.min(endMin, toMinutes(s.endTime)),
    }))
    .filter((x) => x.end > x.start)
    .sort((a, b) => a.start - b.start);

  const merged: Array<{ start: number; end: number }> = [];
  for (const iv of intervals) {
    const last = merged[merged.length - 1];
    if (!last || iv.start > last.end) {
      merged.push({ ...iv });
    } else {
      last.end = Math.max(last.end, iv.end);
    }
  }

  const free: FreeTimeSlot[] = [];
  let cursor = startMin;
  for (const iv of merged) {
    if (iv.start - cursor >= 30) {
      free.push({ startTime: fromMinutes(cursor), endTime: fromMinutes(iv.start) });
    }
    cursor = Math.max(cursor, iv.end);
  }
  if (endMin - cursor >= 30) {
    free.push({ startTime: fromMinutes(cursor), endTime: fromMinutes(endMin) });
  }

  return free;
}
