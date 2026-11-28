import {
  DEFAULT_BRANDING,
  type Asset,
  type AssetCategory,
  type AssetCondition,
  type Attendance,
  type BrandingSettings,
  type LabSchedule,
  type Loan,
  type LoanStatus,
  type Maintenance,
  type MaintenanceStatus,
  type PersonRole,
  type ScheduleStatus,
  type ScheduleVenue,
  type SystemRole,
  type UserPrivateInfo,
  type UserProfile,
} from '../types';

const STORAGE_KEY = 'sipalak_local_db_v1';
const CHANNEL_NAME = 'sipalak_local_sync';

interface StoredUser {
  uid: string;
  username: string;
  passwordHash: string;
  displayName: string;
  role: SystemRole;
  unit: string;
  idNumber: string;
  bio: string;
  email: string;
  phone: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

interface StoredSession {
  token: string;
  uid: string;
  expiresAt: number;
}

interface LocalDbState {
  branding: BrandingSettings;
  users: StoredUser[];
  sessions: StoredSession[];
  assets: Asset[];
  loans: Loan[];
  schedules: LabSchedule[];
  maintenances: Maintenance[];
  attendances: Attendance[];
}

const ALLOWED_ROLES = new Set<SystemRole>(['admin', 'teknisi', 'guru', 'siswa', 'pengguna']);
const ALLOWED_SELF_ROLES = new Set<SystemRole>(['guru', 'siswa', 'pengguna']);
const ALLOWED_PERSON_ROLES = new Set<PersonRole>(['Guru', 'Siswa', 'Teknisi', 'Staf']);
const ALLOWED_ASSET_CATEGORIES = new Set<AssetCategory>([
  'Komputer',
  'Monitor',
  'Printer',
  'Jaringan',
  'Proyektor',
  'Periferal',
  'Lainnya',
]);
const ALLOWED_ASSET_CONDITIONS = new Set<AssetCondition>(['Baik', 'Perlu perawatan', 'Rusak']);
const ALLOWED_LOAN_STATUSES = new Set<LoanStatus>([
  'Menunggu',
  'Disetujui',
  'Dipinjam',
  'Dikembalikan',
  'Ditolak',
]);
const ALLOWED_SCHEDULE_STATUSES = new Set<ScheduleStatus>([
  'Menunggu',
  'Disetujui',
  'Ditolak',
  'Selesai',
]);
const ALLOWED_MAINTENANCE_STATUSES = new Set<MaintenanceStatus>([
  'Dijadwalkan',
  'Dalam Proses',
  'Selesai',
]);

function readDb(): LocalDbState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<LocalDbState>;
      const rawBrand = parsed.branding;
      return {
        branding: {
          appName:
            typeof rawBrand?.appName === 'string' && rawBrand.appName.trim()
              ? rawBrand.appName.trim()
              : DEFAULT_BRANDING.appName,
          appSubtitle:
            typeof rawBrand?.appSubtitle === 'string' && rawBrand.appSubtitle.trim()
              ? rawBrand.appSubtitle.trim()
              : DEFAULT_BRANDING.appSubtitle,
          schoolName:
            typeof rawBrand?.schoolName === 'string' && rawBrand.schoolName.trim()
              ? rawBrand.schoolName.trim()
              : DEFAULT_BRANDING.schoolName,
        },
        users: Array.isArray(parsed.users) ? parsed.users : [],
        sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
        assets: Array.isArray(parsed.assets) ? parsed.assets : [],
        loans: Array.isArray(parsed.loans)
          ? parsed.loans.map((loan) => ({
              ...loan,
              lessonPeriod: typeof loan?.lessonPeriod === 'string' ? loan.lessonPeriod : '',
              borrowTime: typeof loan?.borrowTime === 'string' ? loan.borrowTime : '',
              returnTime: typeof loan?.returnTime === 'string' ? loan.returnTime : '',
            }))
          : [],
        schedules: Array.isArray(parsed.schedules)
          ? parsed.schedules.map((sch) => ({
              ...sch,
              venue: sch?.venue === 'Multimedia' ? 'Multimedia' : 'Aula',
              endDate:
                typeof sch?.endDate === 'string' && sch.endDate >= (sch.date || '')
                  ? sch.endDate
                  : String(sch?.date || ''),
              lessonPeriod: typeof sch?.lessonPeriod === 'string' ? sch.lessonPeriod : '',
              setupType: typeof sch?.setupType === 'string' ? sch.setupType : '',
              participantCount: Number(sch?.participantCount || 0) || 0,
              equipmentNeeds: typeof sch?.equipmentNeeds === 'string' ? sch.equipmentNeeds : '',
              notes: typeof sch?.notes === 'string' ? sch.notes : '',
              adminNotes: typeof sch?.adminNotes === 'string' ? sch.adminNotes : '',
            }))
          : [],
        maintenances: Array.isArray(parsed.maintenances) ? parsed.maintenances : [],
        attendances: Array.isArray(parsed.attendances) ? parsed.attendances : [],
      };
    }
  } catch {
    // Ignore parse errors and return empty state
  }
  return {
    branding: { ...DEFAULT_BRANDING },
    users: [],
    sessions: [],
    assets: [],
    loans: [],
    schedules: [],
    maintenances: [],
    attendances: [],
  };
}

function writeDb(state: LocalDbState, broadcastScope?: string): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if (broadcastScope && typeof BroadcastChannel !== 'undefined') {
    try {
      const ch = new BroadcastChannel(CHANNEL_NAME);
      ch.postMessage({ type: 'sync', scope: broadcastScope });
      ch.close();
    } catch {
      // Ignore BroadcastChannel errors
    }
  }
}

export function subscribeLocalSync(onSync: () => void): () => void {
  if (typeof BroadcastChannel === 'undefined') {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) onSync();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }
  const ch = new BroadcastChannel(CHANNEL_NAME);
  ch.onmessage = () => onSync();
  return () => ch.close();
}

function clampStr(val: unknown, max: number): string {
  if (typeof val !== 'string') return '';
  return val.trim().slice(0, max);
}

function sanitizeUsername(val: unknown): string {
  if (typeof val !== 'string') return '';
  return val
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '')
    .slice(0, 40);
}

function genId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

async function sha256Hex(input: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const buf = new TextEncoder().encode(input);
    const hash = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  let acc = 2166136261;
  for (let i = 0; i < input.length; i++) {
    acc ^= input.charCodeAt(i);
    acc = Math.imul(acc, 16777619);
  }
  return (acc >>> 0).toString(16);
}

async function hashPassword(password: string): Promise<string> {
  const salt = genId().replace(/-/g, '').slice(0, 16);
  const digest = await sha256Hex(`${salt}:${password}`);
  return `${salt}:${digest}`;
}

async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [salt, expected] = storedHash.split(':');
  if (!salt || !expected) return false;
  const actual = await sha256Hex(`${salt}:${password}`);
  return actual === expected;
}

function toUserProfile(u: StoredUser): UserProfile {
  return {
    uid: u.uid,
    username: u.username,
    displayName: u.displayName,
    role: u.role,
    unit: u.unit,
    idNumber: u.idNumber,
    bio: u.bio,
    active: u.active,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  };
}

function toUserPrivateInfo(u: StoredUser): UserPrivateInfo {
  return {
    uid: u.uid,
    email: u.email,
    phone: u.phone,
    updatedAt: u.updatedAt,
  };
}

function localHttpError(message: string, status: number): Error & { status: number } {
  const err = new Error(message) as Error & { status: number };
  err.status = status;
  return err;
}

function requireLocalAuth(state: LocalDbState, token: string | null): StoredUser {
  if (!token) {
    throw localHttpError('Sesi tidak ditemukan. Silakan masuk terlebih dahulu.', 401);
  }
  const now = Date.now();
  const session = state.sessions.find((s) => s.token === token && s.expiresAt > now);
  if (!session) {
    throw localHttpError('Sesi tidak valid atau telah berakhir. Silakan masuk ulang.', 401);
  }
  const user = state.users.find((u) => u.uid === session.uid);
  if (!user || !user.active) {
    throw localHttpError('Akun Anda tidak aktif atau tidak ditemukan.', 401);
  }
  return user;
}

function requireLocalAdmin(user: StoredUser): void {
  if (user.role !== 'admin') {
    throw localHttpError('Akses ditolak. Fitur ini khusus Administrator Lab.', 403);
  }
}

export async function handleLocalApiRequest<T>(
  path: string,
  method: string,
  body: Record<string, unknown>,
  token: string | null
): Promise<T> {
  const state = readDb();
  const nowIso = new Date().toISOString();
  const m = method.toUpperCase();

  // --- BRANDING ---
  if (path === '/api/settings/branding' && m === 'GET') {
    return state.branding as T;
  }

  if (path === '/api/settings/branding' && m === 'PUT') {
    const current = requireLocalAuth(state, token);
    requireLocalAdmin(current);
    const appName = clampStr(body.appName, 40);
    const appSubtitle = clampStr(body.appSubtitle, 120);
    const schoolName = clampStr(body.schoolName, 100);
    if (!appName || !appSubtitle || !schoolName) {
      throw localHttpError('Nama aplikasi, subjudul, dan nama instansi wajib diisi.', 400);
    }
    state.branding = { appName, appSubtitle, schoolName };
    writeDb(state, 'branding');
    return state.branding as T;
  }

  // --- AUTH ---
  if (path === '/api/auth/bootstrap-status' && m === 'GET') {
    return { needsSetup: state.users.length === 0 } as T;
  }

  if (path === '/api/auth/bootstrap' && m === 'POST') {
    if (state.users.length > 0) {
      throw localHttpError(
        'Akun admin awal sudah dibuat. Silakan masuk menggunakan username dan kata sandi.',
        409
      );
    }
    const displayName = clampStr(body.displayName, 80);
    const username = sanitizeUsername(body.username);
    const password = typeof body.password === 'string' ? body.password.trim() : '';
    const email = clampStr(body.email, 120).toLowerCase();
    const unit = clampStr(body.unit, 60) || 'Lab Komputer Akuntansi';

    if (!displayName || !username || username.length < 2) {
      throw localHttpError('Nama lengkap dan username minimal 2 karakter wajib diisi.', 400);
    }
    if (password.length < 6) {
      throw localHttpError('Kata sandi minimal harus 6 karakter.', 400);
    }

    const uid = genId();
    const passwordHash = await hashPassword(password);
    const newUser: StoredUser = {
      uid,
      username,
      passwordHash,
      displayName,
      role: 'admin',
      unit,
      idNumber: '',
      bio: 'Administrator SIPALAK',
      email,
      phone: '',
      active: true,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    const sessionToken = `${genId()}-${genId()}`;
    state.users.push(newUser);
    state.sessions.push({
      token: sessionToken,
      uid,
      expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 7,
    });
    writeDb(state, 'users');
    return {
      token: sessionToken,
      profile: toUserProfile(newUser),
      privateInfo: toUserPrivateInfo(newUser),
    } as T;
  }

  if (path === '/api/auth/login' && m === 'POST') {
    const identifier = clampStr(body.identifier, 120).toLowerCase();
    const password = typeof body.password === 'string' ? body.password : '';
    if (!identifier || !password) {
      throw localHttpError('Nama pengguna dan kata sandi wajib diisi.', 400);
    }

    let user: StoredUser | undefined;
    if (identifier.includes('@')) {
      user = state.users.find((u) => u.email.toLowerCase() === identifier);
    } else {
      const usernameKey = sanitizeUsername(identifier);
      if (!usernameKey) {
        throw localHttpError('Format nama pengguna tidak valid.', 400);
      }
      user = state.users.find((u) => u.username === usernameKey);
    }

    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      throw localHttpError('Nama pengguna atau kata sandi tidak sesuai.', 401);
    }
    if (!user.active) {
      throw localHttpError(
        'Akun Anda sedang dinonaktifkan oleh Administrator. Hubungi Admin Lab.',
        403
      );
    }

    const sessionToken = `${genId()}-${genId()}`;
    state.sessions.push({
      token: sessionToken,
      uid: user.uid,
      expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 7,
    });
    writeDb(state);
    return {
      token: sessionToken,
      profile: toUserProfile(user),
      privateInfo: toUserPrivateInfo(user),
    } as T;
  }

  if (path === '/api/auth/logout' && m === 'POST') {
    if (token) {
      state.sessions = state.sessions.filter((s) => s.token !== token);
      writeDb(state);
    }
    return { ok: true } as T;
  }

  if (path === '/api/auth/me' && m === 'GET') {
    const current = requireLocalAuth(state, token);
    return {
      profile: toUserProfile(current),
      privateInfo: toUserPrivateInfo(current),
    } as T;
  }

  if (path === '/api/auth/profile' && m === 'PUT') {
    const current = requireLocalAuth(state, token);
    const displayName = clampStr(body.displayName, 80) || current.displayName;
    const requestedUsername = sanitizeUsername(body.username);
    const nextUsername = requestedUsername || current.username;
    const newPassword = typeof body.newPassword === 'string' ? body.newPassword.trim() : '';
    const requestedRole = typeof body.role === 'string' ? (body.role as SystemRole) : '';

    if (
      nextUsername !== current.username &&
      state.users.some((u) => u.username === nextUsername && u.uid !== current.uid)
    ) {
      throw localHttpError('Username tersebut sudah digunakan oleh akun lain.', 409);
    }

    let passwordUpdated = false;
    if (newPassword) {
      if (newPassword.length < 6) {
        throw localHttpError('Kata sandi baru minimal harus 6 karakter.', 400);
      }
      current.passwordHash = await hashPassword(newPassword);
      passwordUpdated = true;
    }

    if (
      requestedRole &&
      ALLOWED_SELF_ROLES.has(current.role) &&
      ALLOWED_SELF_ROLES.has(requestedRole)
    ) {
      current.role = requestedRole;
    }

    current.displayName = displayName;
    current.username = nextUsername;
    current.unit = clampStr(body.unit, 60);
    current.idNumber = clampStr(body.idNumber, 40);
    current.bio = clampStr(body.bio, 240);
    current.email = clampStr(body.email, 120).toLowerCase();
    current.phone = clampStr(body.phone, 30);
    current.updatedAt = nowIso;

    writeDb(state, 'users');
    return {
      passwordUpdated,
      profile: toUserProfile(current),
      privateInfo: toUserPrivateInfo(current),
    } as T;
  }

  // --- SNAPSHOT ---
  if (path === '/api/data' && m === 'GET') {
    const current = requireLocalAuth(state, token);
    const isAdmin = current.role === 'admin';
    return {
      assets: [...state.assets].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      loans: (isAdmin
        ? state.loans
        : state.loans.filter((l) => l.requesterId === current.uid)
      ).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      schedules: [...state.schedules].sort((a, b) =>
        `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`)
      ),
      maintenances: (isAdmin
        ? state.maintenances
        : state.maintenances.filter((x) => x.createdBy === current.uid)
      ).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      attendances: (isAdmin
        ? state.attendances
        : state.attendances.filter((a) => a.userId === current.uid)
      ).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      users: isAdmin
        ? [...state.users]
            .sort((a, b) => a.displayName.localeCompare(b.displayName))
            .map(toUserProfile)
        : [toUserProfile(current)],
    } as T;
  }

  // --- ASSETS ---
  if (path === '/api/assets' && m === 'POST') {
    const current = requireLocalAuth(state, token);
    requireLocalAdmin(current);
    const code = clampStr(body.code, 50);
    const name = clampStr(body.name, 100);
    const category = String(body.category || 'Komputer') as AssetCategory;
    const brand = clampStr(body.brand, 80);
    const condition = String(body.condition || 'Baik') as AssetCondition;
    const location = clampStr(body.location, 100);
    if (
      !code ||
      !name ||
      !brand ||
      !location ||
      !ALLOWED_ASSET_CATEGORIES.has(category) ||
      !ALLOWED_ASSET_CONDITIONS.has(condition)
    ) {
      throw localHttpError('Data aset tidak valid atau kolom wajib belum lengkap.', 400);
    }
    const id = genId();
    state.assets.push({
      id,
      code,
      name,
      category,
      brand,
      condition,
      location,
      fundingSource: clampStr(body.fundingSource, 80),
      procurementYear: Math.min(2100, Math.max(1990, Math.round(Number(body.procurementYear) || 2026))),
      nextMaintenanceDate: clampStr(body.nextMaintenanceDate, 20),
      labScope: 'smkn1sambeng',
      createdBy: current.uid,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
    writeDb(state, 'assets');
    return { id } as T;
  }

  if (path === '/api/assets/seed-samples' && m === 'POST') {
    const current = requireLocalAuth(state, token);
    requireLocalAdmin(current);
    const samples: Array<Omit<Asset, 'id' | 'labScope' | 'createdBy' | 'createdAt' | 'updatedAt'>> = [
      {
        code: 'LAB-PC-001',
        name: 'Komputer Praktik 01',
        category: 'Komputer',
        brand: 'Lenovo',
        condition: 'Baik',
        location: 'Lab Komputer Akuntansi',
        fundingSource: 'BOS',
        procurementYear: 2024,
        nextMaintenanceDate: '',
      },
      {
        code: 'LAB-MON-001',
        name: 'Monitor 01',
        category: 'Monitor',
        brand: 'AOC',
        condition: 'Baik',
        location: 'Lab Komputer Akuntansi',
        fundingSource: 'BOS',
        procurementYear: 2024,
        nextMaintenanceDate: '',
      },
      {
        code: 'LAB-PRN-001',
        name: 'Printer Laboratorium',
        category: 'Printer',
        brand: 'Epson',
        condition: 'Perlu perawatan',
        location: 'Ruang Teknisi',
        fundingSource: 'Komite',
        procurementYear: 2023,
        nextMaintenanceDate: '',
      },
      {
        code: '01.03.010102',
        name: 'Laptop',
        category: 'Komputer',
        brand: 'Acer',
        condition: 'Baik',
        location: 'Lab Akuntansi',
        fundingSource: 'APBD',
        procurementYear: 2026,
        nextMaintenanceDate: '',
      },
    ];
    for (const s of samples) {
      state.assets.push({
        id: genId(),
        ...s,
        labScope: 'smkn1sambeng',
        createdBy: current.uid,
        createdAt: nowIso,
        updatedAt: nowIso,
      });
    }
    writeDb(state, 'assets');
    return { ok: true } as T;
  }

  if (path.startsWith('/api/assets/') && m === 'PUT') {
    const current = requireLocalAuth(state, token);
    requireLocalAdmin(current);
    const id = path.slice('/api/assets/'.length);
    const asset = state.assets.find((a) => a.id === id);
    if (!asset) throw localHttpError('Aset tidak ditemukan.', 404);
    const code = clampStr(body.code, 50);
    const name = clampStr(body.name, 100);
    const category = String(body.category || 'Komputer') as AssetCategory;
    const brand = clampStr(body.brand, 80);
    const condition = String(body.condition || 'Baik') as AssetCondition;
    const location = clampStr(body.location, 100);
    if (
      !code ||
      !name ||
      !brand ||
      !location ||
      !ALLOWED_ASSET_CATEGORIES.has(category) ||
      !ALLOWED_ASSET_CONDITIONS.has(condition)
    ) {
      throw localHttpError('Data aset tidak valid.', 400);
    }
    asset.code = code;
    asset.name = name;
    asset.category = category;
    asset.brand = brand;
    asset.condition = condition;
    asset.location = location;
    asset.fundingSource = clampStr(body.fundingSource, 80);
    asset.procurementYear = Math.min(2100, Math.max(1990, Math.round(Number(body.procurementYear) || 2026)));
    asset.nextMaintenanceDate = clampStr(body.nextMaintenanceDate, 20);
    asset.updatedAt = nowIso;
    writeDb(state, 'assets');
    return { ok: true } as T;
  }

  if (path.startsWith('/api/assets/') && m === 'DELETE') {
    const current = requireLocalAuth(state, token);
    requireLocalAdmin(current);
    const id = path.slice('/api/assets/'.length);
    state.assets = state.assets.filter((a) => a.id !== id);
    writeDb(state, 'assets');
    return { ok: true } as T;
  }

  // --- LOANS ---
  if (path === '/api/loans' && m === 'POST') {
    const current = requireLocalAuth(state, token);
    const assetId = clampStr(body.assetId, 128);
    const asset = state.assets.find((a) => a.id === assetId);
    if (!asset) throw localHttpError('Aset yang dipilih tidak ditemukan.', 404);
    const borrowerName = clampStr(body.borrowerName, 80);
    const borrowerRole = (
      current.role === 'guru' ? 'Guru' : String(body.borrowerRole || 'Guru')
    ) as PersonRole;
    const unit = clampStr(body.unit, 60);
    const borrowDate = clampStr(body.borrowDate, 20);
    const returnDate = clampStr(body.returnDate, 20);
    const lessonPeriod = clampStr(body.lessonPeriod, 40);
    const borrowTime = clampStr(body.borrowTime, 10);
    const returnTime = clampStr(body.returnTime, 10);
    const purpose = clampStr(body.purpose, 240);
    if (
      !borrowerName ||
      !unit ||
      !borrowDate ||
      !returnDate ||
      !lessonPeriod ||
      !borrowTime ||
      !returnTime ||
      !purpose ||
      !ALLOWED_PERSON_ROLES.has(borrowerRole)
    ) {
      throw localHttpError('Data peminjaman belum lengkap.', 400);
    }
    const id = genId();
    state.loans.push({
      id,
      assetId,
      assetCode: asset.code,
      assetName: asset.name,
      requesterId: current.uid,
      borrowerName,
      borrowerRole,
      unit,
      borrowDate,
      returnDate,
      lessonPeriod,
      borrowTime,
      returnTime,
      purpose,
      status: 'Menunggu',
      notes: clampStr(body.notes, 240),
      createdAt: nowIso,
      updatedAt: nowIso,
    });
    writeDb(state, 'loans');
    return { id } as T;
  }

  if (path.startsWith('/api/loans/') && m === 'PUT') {
    const current = requireLocalAuth(state, token);
    const id = path.slice('/api/loans/'.length);
    const loan = state.loans.find((l) => l.id === id);
    if (!loan) throw localHttpError('Data peminjaman tidak ditemukan.', 404);
    const isAdmin = current.role === 'admin';
    if (!isAdmin && loan.requesterId !== current.uid) {
      throw localHttpError('Anda tidak memiliki izin mengubah peminjaman ini.', 403);
    }
    if (isAdmin) {
      const status = String(body.status || loan.status) as LoanStatus;
      if (!ALLOWED_LOAN_STATUSES.has(status)) {
        throw localHttpError('Status peminjaman tidak valid.', 400);
      }
      loan.status = status;
      if (body.notes !== undefined) loan.notes = clampStr(body.notes, 240);
      if (body.returnDate !== undefined) loan.returnDate = clampStr(body.returnDate, 20);
    } else {
      if (loan.status !== 'Menunggu') {
        throw localHttpError('Peminjaman yang sudah diproses tidak dapat diubah.', 403);
      }
      loan.borrowDate = clampStr(body.borrowDate, 20) || loan.borrowDate;
      loan.returnDate = clampStr(body.returnDate, 20) || loan.returnDate;
      loan.lessonPeriod = clampStr(body.lessonPeriod, 40) || loan.lessonPeriod;
      loan.borrowTime = clampStr(body.borrowTime, 10) || loan.borrowTime;
      loan.returnTime = clampStr(body.returnTime, 10) || loan.returnTime;
      loan.purpose = clampStr(body.purpose, 240) || loan.purpose;
      if (body.notes !== undefined) loan.notes = clampStr(body.notes, 240);
    }
    loan.updatedAt = nowIso;
    writeDb(state, 'loans');
    return { ok: true } as T;
  }

  if (path.startsWith('/api/loans/') && m === 'DELETE') {
    const current = requireLocalAuth(state, token);
    const id = path.slice('/api/loans/'.length);
    const loan = state.loans.find((l) => l.id === id);
    if (loan) {
      const canDelete =
        current.role === 'admin' || (loan.requesterId === current.uid && loan.status === 'Menunggu');
      if (!canDelete) {
        throw localHttpError('Anda tidak memiliki izin menghapus peminjaman ini.', 403);
      }
      state.loans = state.loans.filter((l) => l.id !== id);
      writeDb(state, 'loans');
    }
    return { ok: true } as T;
  }

  // --- SCHEDULES ---
  if (path === '/api/schedules' && m === 'POST') {
    const current = requireLocalAuth(state, token);
    const venue: ScheduleVenue = body.venue === 'Multimedia' ? 'Multimedia' : 'Aula';
    const date = clampStr(body.date, 20);
    const rawEndDate = clampStr(body.endDate, 20);
    const endDate = rawEndDate && rawEndDate >= date ? rawEndDate : date;
    const startTime = clampStr(body.startTime, 10);
    const endTime = clampStr(body.endTime, 10);
    const lessonPeriod = clampStr(body.lessonPeriod, 40);
    const activity = clampStr(body.activity, 120);
    const setupType = clampStr(body.setupType, 60);
    const participantCount = Math.max(0, Math.min(2000, Number(body.participantCount) || 0));
    const equipmentNeeds = clampStr(body.equipmentNeeds, 240);
    const notes = clampStr(body.notes, 300);
    const requesterName = clampStr(body.requesterName, 80);
    const requesterRole = String(body.requesterRole || 'Guru') as PersonRole;
    const unit = clampStr(body.unit, 60);
    if (
      !date ||
      !startTime ||
      !endTime ||
      !activity ||
      !requesterName ||
      !unit ||
      !ALLOWED_PERSON_ROLES.has(requesterRole)
    ) {
      throw localHttpError('Data jadwal peminjaman ruangan belum lengkap.', 400);
    }
    const rawSeries = Array.isArray(body.recurrenceDates) ? body.recurrenceDates : [];
    const seriesItems = rawSeries
      .map((item) => {
        if (!item || typeof item !== 'object') return null;
        const rec = item as Record<string, unknown>;
        const d = clampStr(rec.date, 20);
        const ed = clampStr(rec.endDate, 20);
        if (!d) return null;
        return { date: d, endDate: ed && ed >= d ? ed : d };
      })
      .filter((x): x is { date: string; endDate: string } => x !== null)
      .slice(0, 12);

    const targets = seriesItems.length > 1 ? seriesItems : [{ date, endDate }];
    let firstId = '';
    for (const slot of targets) {
      const id = genId();
      if (!firstId) firstId = id;
      state.schedules.push({
        id,
        venue,
        date: slot.date,
        endDate: slot.endDate,
        startTime,
        endTime,
        lessonPeriod,
        activity,
        setupType,
        participantCount,
        equipmentNeeds,
        notes,
        adminNotes: '',
        requesterId: current.uid,
        requesterName,
        requesterRole,
        unit,
        status: 'Menunggu',
        labScope: 'smkn1sambeng',
        createdAt: nowIso,
        updatedAt: nowIso,
      });
    }
    writeDb(state, 'schedules');
    return { id: firstId, count: targets.length } as T;
  }

  if (path.startsWith('/api/schedules/') && m === 'PUT') {
    const current = requireLocalAuth(state, token);
    const id = path.slice('/api/schedules/'.length);
    const s = state.schedules.find((x) => x.id === id);
    if (!s) throw localHttpError('Jadwal tidak ditemukan.', 404);
    const isAdmin = current.role === 'admin';
    if (!isAdmin && s.requesterId !== current.uid) {
      throw localHttpError('Anda tidak memiliki izin mengubah jadwal ini.', 403);
    }
    if (isAdmin) {
      const status = String(body.status || s.status) as ScheduleStatus;
      if (!ALLOWED_SCHEDULE_STATUSES.has(status)) {
        throw localHttpError('Status jadwal tidak valid.', 400);
      }
      s.status = status;
      if (body.venue === 'Aula' || body.venue === 'Multimedia') s.venue = body.venue;
      if (body.date !== undefined) s.date = clampStr(body.date, 20);
      if (body.endDate !== undefined) {
        const ed = clampStr(body.endDate, 20);
        s.endDate = ed && ed >= s.date ? ed : s.date;
      }
      if (body.startTime !== undefined) s.startTime = clampStr(body.startTime, 10);
      if (body.endTime !== undefined) s.endTime = clampStr(body.endTime, 10);
      if (body.lessonPeriod !== undefined) s.lessonPeriod = clampStr(body.lessonPeriod, 40);
      if (body.activity !== undefined) s.activity = clampStr(body.activity, 120);
      if (body.setupType !== undefined) s.setupType = clampStr(body.setupType, 60);
      if (body.participantCount !== undefined) {
        s.participantCount = Math.max(0, Math.min(2000, Number(body.participantCount) || 0));
      }
      if (body.equipmentNeeds !== undefined) s.equipmentNeeds = clampStr(body.equipmentNeeds, 240);
      if (body.notes !== undefined) s.notes = clampStr(body.notes, 300);
      if (body.adminNotes !== undefined) s.adminNotes = clampStr(body.adminNotes, 300);
      if (body.unit !== undefined) s.unit = clampStr(body.unit, 60);
    } else {
      if (s.status !== 'Menunggu') {
        throw localHttpError('Jadwal yang sudah diproses tidak dapat diubah.', 403);
      }
      if (body.venue === 'Aula' || body.venue === 'Multimedia') s.venue = body.venue;
      s.date = clampStr(body.date, 20) || s.date;
      if (body.endDate !== undefined) {
        const ed = clampStr(body.endDate, 20);
        s.endDate = ed && ed >= s.date ? ed : s.date;
      }
      s.startTime = clampStr(body.startTime, 10) || s.startTime;
      s.endTime = clampStr(body.endTime, 10) || s.endTime;
      if (body.lessonPeriod !== undefined) s.lessonPeriod = clampStr(body.lessonPeriod, 40);
      s.activity = clampStr(body.activity, 120) || s.activity;
      if (body.setupType !== undefined) s.setupType = clampStr(body.setupType, 60);
      if (body.participantCount !== undefined) {
        s.participantCount = Math.max(0, Math.min(2000, Number(body.participantCount) || 0));
      }
      if (body.equipmentNeeds !== undefined) s.equipmentNeeds = clampStr(body.equipmentNeeds, 240);
      if (body.notes !== undefined) s.notes = clampStr(body.notes, 300);
      s.unit = clampStr(body.unit, 60) || s.unit;
    }
    s.updatedAt = nowIso;
    writeDb(state, 'schedules');
    return { ok: true } as T;
  }

  if (path.startsWith('/api/schedules/') && m === 'DELETE') {
    const current = requireLocalAuth(state, token);
    const id = path.slice('/api/schedules/'.length);
    const s = state.schedules.find((x) => x.id === id);
    if (s) {
      const canDelete =
        current.role === 'admin' || (s.requesterId === current.uid && s.status === 'Menunggu');
      if (!canDelete) {
        throw localHttpError('Anda tidak memiliki izin menghapus jadwal ini.', 403);
      }
      state.schedules = state.schedules.filter((x) => x.id !== id);
      writeDb(state, 'schedules');
    }
    return { ok: true } as T;
  }

  // --- MAINTENANCES ---
  if (path === '/api/maintenances' && m === 'POST') {
    const current = requireLocalAuth(state, token);
    requireLocalAdmin(current);
    const assetId = clampStr(body.assetId, 128);
    const asset = state.assets.find((a) => a.id === assetId);
    if (!asset) throw localHttpError('Aset tidak ditemukan.', 404);
    const issue = clampStr(body.issue, 240);
    const technicianName = clampStr(body.technicianName, 80);
    const maintenanceDate = clampStr(body.maintenanceDate, 20);
    const status = String(body.status || 'Dijadwalkan') as MaintenanceStatus;
    const resultingCondition = String(body.resultingCondition || 'Baik') as AssetCondition;
    if (
      !issue ||
      !technicianName ||
      !maintenanceDate ||
      !ALLOWED_MAINTENANCE_STATUSES.has(status) ||
      !ALLOWED_ASSET_CONDITIONS.has(resultingCondition)
    ) {
      throw localHttpError('Data perawatan belum lengkap atau tidak valid.', 400);
    }
    const id = genId();
    state.maintenances.push({
      id,
      assetId,
      assetCode: asset.code,
      assetName: asset.name,
      issue,
      actionTaken: clampStr(body.actionTaken, 240),
      technicianName,
      maintenanceDate,
      status,
      resultingCondition,
      createdBy: current.uid,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
    if (body.syncAssetCondition) {
      asset.condition = resultingCondition;
      asset.updatedAt = nowIso;
    }
    writeDb(state, 'maintenances');
    return { id } as T;
  }

  if (path.startsWith('/api/maintenances/') && m === 'PUT') {
    const current = requireLocalAuth(state, token);
    requireLocalAdmin(current);
    const id = path.slice('/api/maintenances/'.length);
    const maint = state.maintenances.find((x) => x.id === id);
    if (!maint) throw localHttpError('Data perawatan tidak ditemukan.', 404);
    const issue = clampStr(body.issue, 240);
    const technicianName = clampStr(body.technicianName, 80);
    const maintenanceDate = clampStr(body.maintenanceDate, 20);
    const status = String(body.status || maint.status) as MaintenanceStatus;
    const resultingCondition = String(
      body.resultingCondition || maint.resultingCondition
    ) as AssetCondition;
    if (
      !issue ||
      !technicianName ||
      !maintenanceDate ||
      !ALLOWED_MAINTENANCE_STATUSES.has(status) ||
      !ALLOWED_ASSET_CONDITIONS.has(resultingCondition)
    ) {
      throw localHttpError('Data perawatan tidak valid.', 400);
    }
    maint.issue = issue;
    maint.actionTaken = clampStr(body.actionTaken, 240);
    maint.technicianName = technicianName;
    maint.maintenanceDate = maintenanceDate;
    maint.status = status;
    maint.resultingCondition = resultingCondition;
    maint.updatedAt = nowIso;
    if (body.syncAssetCondition) {
      const asset = state.assets.find((a) => a.id === maint.assetId);
      if (asset) {
        asset.condition = resultingCondition;
        asset.updatedAt = nowIso;
      }
    }
    writeDb(state, 'maintenances');
    return { ok: true } as T;
  }

  if (path.startsWith('/api/maintenances/') && m === 'DELETE') {
    const current = requireLocalAuth(state, token);
    requireLocalAdmin(current);
    const id = path.slice('/api/maintenances/'.length);
    state.maintenances = state.maintenances.filter((x) => x.id !== id);
    writeDb(state, 'maintenances');
    return { ok: true } as T;
  }

  // --- ATTENDANCES ---
  if (path === '/api/attendances' && m === 'POST') {
    const current = requireLocalAuth(state, token);
    const date = clampStr(body.date, 20);
    const checkInTime = clampStr(body.checkInTime, 10);
    const visitorName = clampStr(body.visitorName, 80);
    const visitorRole = String(body.visitorRole || 'Guru') as PersonRole;
    const unit = clampStr(body.unit, 60);
    const activity = clampStr(body.activity, 120);
    if (
      !date ||
      !checkInTime ||
      !visitorName ||
      !unit ||
      !activity ||
      !ALLOWED_PERSON_ROLES.has(visitorRole)
    ) {
      throw localHttpError('Data absensi belum lengkap.', 400);
    }
    const id = genId();
    state.attendances.push({
      id,
      userId: current.uid,
      date,
      checkInTime,
      checkOutTime: clampStr(body.checkOutTime, 10),
      visitorName,
      visitorRole,
      unit,
      activity,
      workstation: clampStr(body.workstation, 40),
      notes: clampStr(body.notes, 200),
      createdAt: nowIso,
      updatedAt: nowIso,
    });
    writeDb(state, 'attendances');
    return { id } as T;
  }

  if (path.startsWith('/api/attendances/') && m === 'PUT') {
    const current = requireLocalAuth(state, token);
    const id = path.slice('/api/attendances/'.length);
    const att = state.attendances.find((x) => x.id === id);
    if (!att) throw localHttpError('Data absensi tidak ditemukan.', 404);
    const isAdmin = current.role === 'admin';
    if (!isAdmin && att.userId !== current.uid) {
      throw localHttpError('Anda tidak memiliki izin mengubah absensi ini.', 403);
    }
    if (isAdmin) {
      if (body.checkOutTime !== undefined) att.checkOutTime = clampStr(body.checkOutTime, 10);
      if (body.workstation !== undefined) att.workstation = clampStr(body.workstation, 40);
      if (body.notes !== undefined) att.notes = clampStr(body.notes, 200);
      if (body.activity !== undefined) att.activity = clampStr(body.activity, 120);
    } else {
      if (att.checkOutTime !== '') {
        throw localHttpError('Absensi keluar sudah tercatat.', 403);
      }
      att.checkOutTime = clampStr(body.checkOutTime, 10);
      if (body.notes !== undefined) att.notes = clampStr(body.notes, 200);
    }
    att.updatedAt = nowIso;
    writeDb(state, 'attendances');
    return { ok: true } as T;
  }

  if (path.startsWith('/api/attendances/') && m === 'DELETE') {
    const current = requireLocalAuth(state, token);
    requireLocalAdmin(current);
    const id = path.slice('/api/attendances/'.length);
    state.attendances = state.attendances.filter((x) => x.id !== id);
    writeDb(state, 'attendances');
    return { ok: true } as T;
  }

  // --- USERS ---
  if (path === '/api/users' && m === 'POST') {
    const current = requireLocalAuth(state, token);
    requireLocalAdmin(current);
    const displayName = clampStr(body.displayName, 80);
    const username = sanitizeUsername(body.username);
    const password = typeof body.password === 'string' ? body.password.trim() : '';
    const role = String(body.role || 'pengguna') as SystemRole;
    if (!displayName || !username || username.length < 2) {
      throw localHttpError('Nama lengkap dan username minimal 2 karakter wajib diisi.', 400);
    }
    if (password.length < 6) {
      throw localHttpError('Password masuk minimal harus 6 karakter.', 400);
    }
    if (!ALLOWED_ROLES.has(role)) {
      throw localHttpError('Peran akses sistem tidak valid.', 400);
    }
    if (state.users.some((u) => u.username === username)) {
      throw localHttpError(`Username @${username} sudah digunakan oleh akun lain.`, 409);
    }
    const uid = genId();
    const newUser: StoredUser = {
      uid,
      username,
      passwordHash: await hashPassword(password),
      displayName,
      role,
      unit: clampStr(body.unit, 60),
      idNumber: clampStr(body.idNumber, 40),
      bio: clampStr(body.bio, 240),
      email: clampStr(body.email, 120).toLowerCase(),
      phone: clampStr(body.phone, 30),
      active: body.active !== false,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    state.users.push(newUser);
    writeDb(state, 'users');
    return { user: toUserProfile(newUser) } as T;
  }

  if (path.startsWith('/api/users/') && m === 'PUT') {
    const current = requireLocalAuth(state, token);
    requireLocalAdmin(current);
    const targetUid = path.slice('/api/users/'.length);
    const existing = state.users.find((u) => u.uid === targetUid);
    if (!existing) throw localHttpError('Akun pengguna tidak ditemukan.', 404);
    const role = String(body.role || existing.role) as SystemRole;
    if (!ALLOWED_ROLES.has(role)) {
      throw localHttpError('Peran akses sistem tidak valid.', 400);
    }
    const active = body.active !== undefined ? Boolean(body.active) : existing.active;
    if (targetUid === current.uid && (!active || role !== 'admin')) {
      throw localHttpError(
        'Anda tidak dapat menonaktifkan atau menurunkan peran Admin akun yang sedang Anda gunakan.',
        400
      );
    }
    const nextUsername = sanitizeUsername(body.username) || existing.username;
    if (
      nextUsername !== existing.username &&
      state.users.some((u) => u.username === nextUsername && u.uid !== targetUid)
    ) {
      throw localHttpError('Username tersebut sudah digunakan oleh akun lain.', 409);
    }
    const newPassword = typeof body.newPassword === 'string' ? body.newPassword.trim() : '';
    if (newPassword) {
      if (newPassword.length < 6) {
        throw localHttpError('Password baru minimal harus 6 karakter.', 400);
      }
      existing.passwordHash = await hashPassword(newPassword);
    }
    existing.displayName = clampStr(body.displayName, 80) || existing.displayName;
    existing.username = nextUsername;
    existing.role = role;
    existing.unit = clampStr(body.unit, 60);
    existing.idNumber = clampStr(body.idNumber, 40);
    existing.bio = clampStr(body.bio, 240);
    existing.active = active;
    existing.updatedAt = nowIso;
    if (!active) {
      state.sessions = state.sessions.filter((s) => s.uid !== targetUid);
    }
    writeDb(state, 'users');
    return { ok: true } as T;
  }

  if (path.startsWith('/api/users/') && m === 'DELETE') {
    const current = requireLocalAuth(state, token);
    requireLocalAdmin(current);
    const targetUid = path.slice('/api/users/'.length);
    if (targetUid === current.uid) {
      throw localHttpError('Anda tidak dapat menghapus akun yang sedang aktif digunakan.', 400);
    }
    state.sessions = state.sessions.filter((s) => s.uid !== targetUid);
    state.users = state.users.filter((u) => u.uid !== targetUid);
    writeDb(state, 'users');
    return { ok: true } as T;
  }

  throw localHttpError(`Endpoint tidak ditemukan: ${m} ${path}`, 404);
}
