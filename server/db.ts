import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const dbPath = path.resolve(process.cwd(), 'sipalak.db');
export const db = new DatabaseSync(dbPath);

db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    uid TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    role TEXT NOT NULL,
    unit TEXT NOT NULL DEFAULT '',
    id_number TEXT NOT NULL DEFAULT '',
    bio TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    active INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    uid TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    FOREIGN KEY (uid) REFERENCES users(uid) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS assets (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    brand TEXT NOT NULL,
    condition TEXT NOT NULL,
    location TEXT NOT NULL,
    funding_source TEXT NOT NULL DEFAULT '',
    procurement_year INTEGER NOT NULL,
    next_maintenance_date TEXT NOT NULL DEFAULT '',
    lab_scope TEXT NOT NULL DEFAULT 'smkn1sambeng',
    created_by TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS loans (
    id TEXT PRIMARY KEY,
    asset_id TEXT NOT NULL,
    asset_code TEXT NOT NULL,
    asset_name TEXT NOT NULL,
    requester_id TEXT NOT NULL,
    borrower_name TEXT NOT NULL,
    borrower_role TEXT NOT NULL,
    unit TEXT NOT NULL,
    borrow_date TEXT NOT NULL,
    return_date TEXT NOT NULL,
    purpose TEXT NOT NULL,
    status TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS schedules (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    activity TEXT NOT NULL,
    requester_id TEXT NOT NULL,
    requester_name TEXT NOT NULL,
    requester_role TEXT NOT NULL,
    unit TEXT NOT NULL,
    status TEXT NOT NULL,
    lab_scope TEXT NOT NULL DEFAULT 'smkn1sambeng',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS maintenances (
    id TEXT PRIMARY KEY,
    asset_id TEXT NOT NULL,
    asset_code TEXT NOT NULL,
    asset_name TEXT NOT NULL,
    issue TEXT NOT NULL,
    action_taken TEXT NOT NULL DEFAULT '',
    technician_name TEXT NOT NULL,
    maintenance_date TEXT NOT NULL,
    status TEXT NOT NULL,
    resulting_condition TEXT NOT NULL,
    created_by TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS attendances (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    date TEXT NOT NULL,
    check_in_time TEXT NOT NULL,
    check_out_time TEXT NOT NULL DEFAULT '',
    visitor_name TEXT NOT NULL,
    visitor_role TEXT NOT NULL,
    unit TEXT NOT NULL,
    activity TEXT NOT NULL,
    workstation TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

export interface BrandingSettings {
  appName: string;
  appSubtitle: string;
  schoolName: string;
}

const DEFAULT_BRANDING: BrandingSettings = {
  appName: 'SIPALAK',
  appSubtitle: 'Sistem Pelayanan Laboratorium Komputer',
  schoolName: 'SMK Negeri 1 Sambeng',
};

export function getBrandingSettings(): BrandingSettings {
  const row = db
    .prepare('SELECT value FROM settings WHERE key = ?')
    .get('branding') as { value?: string } | undefined;
  if (!row?.value) return { ...DEFAULT_BRANDING };
  try {
    const parsed = JSON.parse(row.value) as Partial<BrandingSettings>;
    return {
      appName: typeof parsed.appName === 'string' && parsed.appName.trim() ? parsed.appName.trim() : DEFAULT_BRANDING.appName,
      appSubtitle:
        typeof parsed.appSubtitle === 'string' && parsed.appSubtitle.trim()
          ? parsed.appSubtitle.trim()
          : DEFAULT_BRANDING.appSubtitle,
      schoolName:
        typeof parsed.schoolName === 'string' && parsed.schoolName.trim()
          ? parsed.schoolName.trim()
          : DEFAULT_BRANDING.schoolName,
    };
  } catch {
    return { ...DEFAULT_BRANDING };
  }
}

export function saveBrandingSettings(next: BrandingSettings): BrandingSettings {
  const normalized: BrandingSettings = {
    appName: next.appName.trim() || DEFAULT_BRANDING.appName,
    appSubtitle: next.appSubtitle.trim() || DEFAULT_BRANDING.appSubtitle,
    schoolName: next.schoolName.trim() || DEFAULT_BRANDING.schoolName,
  };
  db.prepare(
    `INSERT INTO settings (key, value) VALUES ('branding', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(JSON.stringify(normalized));
  return normalized;
}

export interface DbUserRow {
  uid: string;
  username: string;
  password_hash: string;
  display_name: string;
  role: string;
  unit: string;
  id_number: string;
  bio: string;
  email: string;
  phone: string;
  active: number;
  created_at: number;
  updated_at: number;
}

function toIso(ms: unknown): string {
  const num = Number(ms);
  if (!Number.isFinite(num) || num <= 0) return new Date().toISOString();
  return new Date(num).toISOString();
}

export function mapUserProfile(row: DbUserRow) {
  return {
    uid: row.uid,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    unit: row.unit,
    idNumber: row.id_number,
    bio: row.bio,
    active: row.active === 1,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

export function mapUserPrivateInfo(row: DbUserRow) {
  return {
    uid: row.uid,
    email: row.email,
    phone: row.phone,
    updatedAt: toIso(row.updated_at),
  };
}

export function mapAsset(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    code: String(row.code),
    name: String(row.name),
    category: String(row.category),
    brand: String(row.brand),
    condition: String(row.condition),
    location: String(row.location),
    fundingSource: String(row.funding_source ?? ''),
    procurementYear: Number(row.procurement_year),
    nextMaintenanceDate: String(row.next_maintenance_date ?? ''),
    labScope: String(row.lab_scope ?? 'smkn1sambeng'),
    createdBy: String(row.created_by),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

export function mapLoan(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    assetId: String(row.asset_id),
    assetCode: String(row.asset_code),
    assetName: String(row.asset_name),
    requesterId: String(row.requester_id),
    borrowerName: String(row.borrower_name),
    borrowerRole: String(row.borrower_role),
    unit: String(row.unit),
    borrowDate: String(row.borrow_date),
    returnDate: String(row.return_date),
    purpose: String(row.purpose),
    status: String(row.status),
    notes: String(row.notes ?? ''),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

export function mapSchedule(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    date: String(row.date),
    startTime: String(row.start_time),
    endTime: String(row.end_time),
    activity: String(row.activity),
    requesterId: String(row.requester_id),
    requesterName: String(row.requester_name),
    requesterRole: String(row.requester_role),
    unit: String(row.unit),
    status: String(row.status),
    labScope: String(row.lab_scope ?? 'smkn1sambeng'),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

export function mapMaintenance(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    assetId: String(row.asset_id),
    assetCode: String(row.asset_code),
    assetName: String(row.asset_name),
    issue: String(row.issue),
    actionTaken: String(row.action_taken ?? ''),
    technicianName: String(row.technician_name),
    maintenanceDate: String(row.maintenance_date),
    status: String(row.status),
    resultingCondition: String(row.resulting_condition),
    createdBy: String(row.created_by),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

export function mapAttendance(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    date: String(row.date),
    checkInTime: String(row.check_in_time),
    checkOutTime: String(row.check_out_time ?? ''),
    visitorName: String(row.visitor_name),
    visitorRole: String(row.visitor_role),
    unit: String(row.unit),
    activity: String(row.activity),
    workstation: String(row.workstation ?? ''),
    notes: String(row.notes ?? ''),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}
