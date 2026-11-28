export interface BrandingSettings {
  appName: string;
  appSubtitle: string;
  schoolName: string;
  logoDataUrl?: string;
}

export const DEFAULT_BRANDING: BrandingSettings = {
  appName: 'SIPALAK',
  appSubtitle: 'Sistem Pelayanan Laboratorium Komputer',
  schoolName: 'SMK Negeri 1 Sambeng',
  logoDataUrl: '',
};

export type SystemRole = 'admin' | 'teknisi' | 'guru' | 'siswa' | 'pengguna';
export type PersonRole = 'Guru' | 'Siswa' | 'Teknisi' | 'Staf';
export type AssetCategory =
  | 'Komputer'
  | 'Monitor'
  | 'Printer'
  | 'Jaringan'
  | 'Proyektor'
  | 'Periferal'
  | 'Lainnya';
export type AssetCondition = 'Baik' | 'Perlu perawatan' | 'Rusak';
export type LoanStatus = 'Menunggu' | 'Disetujui' | 'Dipinjam' | 'Dikembalikan' | 'Ditolak';
export type ScheduleStatus = 'Menunggu' | 'Disetujui' | 'Ditolak' | 'Selesai';
export type MaintenanceStatus = 'Dijadwalkan' | 'Dalam Proses' | 'Selesai';

export interface UserProfile {
  uid: string;
  username: string;
  displayName: string;
  role: SystemRole;
  unit: string;
  idNumber: string;
  bio: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UserPrivateInfo {
  uid: string;
  email: string;
  phone: string;
  updatedAt: string;
}

export interface UserInvite {
  id: string;
  email: string;
  displayName: string;
  username: string;
  role: SystemRole;
  unit: string;
  idNumber: string;
  phone: string;
  bio: string;
  active: boolean;
  claimed: boolean;
  claimedByUid: string;
  invitedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface Asset {
  id: string;
  code: string;
  name: string;
  category: AssetCategory;
  brand: string;
  condition: AssetCondition;
  location: string;
  fundingSource: string;
  procurementYear: number;
  nextMaintenanceDate: string;
  labScope: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface Loan {
  id: string;
  assetId: string;
  assetCode: string;
  assetName: string;
  requesterId: string;
  borrowerName: string;
  borrowerRole: PersonRole;
  unit: string;
  borrowDate: string;
  returnDate: string;
  lessonPeriod: string;
  borrowTime: string;
  returnTime: string;
  purpose: string;
  status: LoanStatus;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface AssetLock {
  assetId: string;
  loanId: string;
  requesterId: string;
  status: 'Disetujui' | 'Dipinjam';
  labScope: string;
  updatedAt: string;
}

export interface LabSchedule {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  activity: string;
  requesterId: string;
  requesterName: string;
  requesterRole: PersonRole;
  unit: string;
  status: ScheduleStatus;
  labScope: string;
  createdAt: string;
  updatedAt: string;
}

export interface Maintenance {
  id: string;
  assetId: string;
  assetCode: string;
  assetName: string;
  issue: string;
  actionTaken: string;
  technicianName: string;
  maintenanceDate: string;
  status: MaintenanceStatus;
  resultingCondition: AssetCondition;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface Attendance {
  id: string;
  userId: string;
  date: string;
  checkInTime: string;
  checkOutTime: string;
  visitorName: string;
  visitorRole: PersonRole;
  unit: string;
  activity: string;
  workstation: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface AppDataSnapshot {
  assets: Asset[];
  loans: Loan[];
  assetLocks: AssetLock[];
  schedules: LabSchedule[];
  maintenances: Maintenance[];
  attendances: Attendance[];
  users: UserProfile[];
  invites?: UserInvite[];
}

export const ASSET_CATEGORIES: AssetCategory[] = [
  'Komputer',
  'Monitor',
  'Printer',
  'Jaringan',
  'Proyektor',
  'Periferal',
  'Lainnya',
];

export const ASSET_CONDITIONS: AssetCondition[] = ['Baik', 'Perlu perawatan', 'Rusak'];

export const PERSON_ROLES: PersonRole[] = ['Guru', 'Siswa', 'Teknisi', 'Staf'];

export const SYSTEM_ROLES: { value: SystemRole; label: string }[] = [
  { value: 'admin', label: 'Administrator' },
  { value: 'teknisi', label: 'Teknisi Lab' },
  { value: 'guru', label: 'Guru' },
  { value: 'siswa', label: 'Siswa' },
  { value: 'pengguna', label: 'Pengguna Umum' },
];

export const LOAN_STATUSES: LoanStatus[] = [
  'Menunggu',
  'Disetujui',
  'Dipinjam',
  'Dikembalikan',
  'Ditolak',
];

export const SCHEDULE_STATUSES: ScheduleStatus[] = [
  'Menunggu',
  'Disetujui',
  'Ditolak',
  'Selesai',
];

export const MAINTENANCE_STATUSES: MaintenanceStatus[] = [
  'Dijadwalkan',
  'Dalam Proses',
  'Selesai',
];

export interface LessonPeriodOption {
  value: string;
  label: string;
  startTime: string;
  endTime: string;
}

export const LESSON_PERIOD_OPTIONS: LessonPeriodOption[] = [
  { value: 'Jam ke-1', label: 'Jam ke-1 (07:00 - 07:45)', startTime: '07:00', endTime: '07:45' },
  { value: 'Jam ke-2', label: 'Jam ke-2 (07:45 - 08:30)', startTime: '07:45', endTime: '08:30' },
  { value: 'Jam ke-3', label: 'Jam ke-3 (08:30 - 09:15)', startTime: '08:30', endTime: '09:15' },
  { value: 'Jam ke-4', label: 'Jam ke-4 (09:30 - 10:15)', startTime: '09:30', endTime: '10:15' },
  { value: 'Jam ke-5', label: 'Jam ke-5 (10:15 - 11:00)', startTime: '10:15', endTime: '11:00' },
  { value: 'Jam ke-6', label: 'Jam ke-6 (11:00 - 11:45)', startTime: '11:00', endTime: '11:45' },
  { value: 'Jam ke-7', label: 'Jam ke-7 (12:15 - 13:00)', startTime: '12:15', endTime: '13:00' },
  { value: 'Jam ke-8', label: 'Jam ke-8 (13:00 - 13:45)', startTime: '13:00', endTime: '13:45' },
  { value: 'Jam ke-9', label: 'Jam ke-9 (13:45 - 14:30)', startTime: '13:45', endTime: '14:30' },
  { value: 'Jam ke-10', label: 'Jam ke-10 (14:30 - 15:15)', startTime: '14:30', endTime: '15:15' },
  { value: 'Jam ke-11', label: 'Jam ke-11 (15:15 - 16:00)', startTime: '15:15', endTime: '16:00' },
  { value: 'Jam ke-12', label: 'Jam ke-12 (16:00 - 16:45)', startTime: '16:00', endTime: '16:45' },
  { value: 'Di luar jam KBM', label: 'Di luar jam KBM (Custom)', startTime: '07:00', endTime: '08:30' },
];

export function toLocalIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function todayIsoDate(): string {
  return toLocalIsoDate(new Date());
}

export function currentHmTime(): string {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}
