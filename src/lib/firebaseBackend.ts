import {
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  linkWithCredential,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updatePassword,
  type User,
} from 'firebase/auth';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type Unsubscribe,
} from 'firebase/firestore';
import {
  auth,
  db,
  getSecondaryAuth,
  googleProvider,
  handleFirestoreError,
  OperationType,
} from './firebase';
import {
  ASSET_CATEGORIES,
  ASSET_CONDITIONS,
  DEFAULT_BRANDING,
  LOAN_STATUSES,
  MAINTENANCE_STATUSES,
  PERSON_ROLES,
  SCHEDULE_STATUSES,
  type AppDataSnapshot,
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
  type SystemRole,
  type UserInvite,
  type UserPrivateInfo,
  type UserProfile,
} from '../types';

const BOOTSTRAP_ADMIN_EMAILS = new Set([
  'syaifularis16@guru.sma.belajar.id',
  'yuliwinarsih771@guru.sma.belajar.id',
]);

const ALLOWED_ROLES = new Set<SystemRole>(['admin', 'teknisi', 'guru', 'siswa', 'pengguna']);
const ALLOWED_SELF_ROLES = new Set<SystemRole>(['guru', 'siswa', 'pengguna']);
const ALLOWED_PERSON_ROLES = new Set<PersonRole>(PERSON_ROLES);
const ALLOWED_ASSET_CATEGORIES = new Set<AssetCategory>(ASSET_CATEGORIES);
const ALLOWED_ASSET_CONDITIONS = new Set<AssetCondition>(ASSET_CONDITIONS);
const ALLOWED_LOAN_STATUSES = new Set<LoanStatus>(LOAN_STATUSES);
const ALLOWED_SCHEDULE_STATUSES = new Set<ScheduleStatus>(SCHEDULE_STATUSES);
const ALLOWED_MAINTENANCE_STATUSES = new Set<MaintenanceStatus>(MAINTENANCE_STATUSES);

function clampStr(val: unknown, maxLen: number): string {
  if (typeof val !== 'string') return '';
  return val.trim().slice(0, maxLen);
}

function sanitizeUsername(val: unknown): string {
  if (typeof val !== 'string') return '';
  return val
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '')
    .slice(0, 40);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function deriveEnvelopeKey(
  usernameKey: string,
  password: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(`${usernameKey}:${password}`),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: toArrayBuffer(salt),
      iterations: 100000,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encryptEmailEnvelope(
  usernameKey: string,
  password: string,
  email: string
): Promise<{ salt: string; iv: string; encryptedEmail: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveEnvelopeKey(usernameKey, password, salt);
  const cipherBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(iv) },
    key,
    new TextEncoder().encode(email)
  );
  return {
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    encryptedEmail: bytesToBase64(new Uint8Array(cipherBuf)),
  };
}

async function decryptEmailEnvelope(
  usernameKey: string,
  password: string,
  envelope: { salt: string; iv: string; encryptedEmail: string }
): Promise<string> {
  const salt = base64ToBytes(envelope.salt);
  const iv = base64ToBytes(envelope.iv);
  const cipher = base64ToBytes(envelope.encryptedEmail);
  const key = await deriveEnvelopeKey(usernameKey, password, salt);
  const plainBuf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(iv) },
    key,
    toArrayBuffer(cipher)
  );
  return new TextDecoder().decode(plainBuf);
}

async function upsertUsernameEnvelope(
  uid: string,
  usernameKey: string,
  password: string,
  email: string
): Promise<void> {
  if (!usernameKey) return;
  const envRef = doc(db, 'username_auth', usernameKey);
  const existing = await getDoc(envRef);
  if (existing.exists() && existing.data().uid !== uid) {
    throw new Error(`Nama pengguna "${usernameKey}" sudah digunakan oleh akun lain.`);
  }
  const encrypted = await encryptEmailEnvelope(usernameKey, password, email);
  await setDoc(envRef, {
    uid,
    salt: encrypted.salt,
    iv: encrypted.iv,
    encryptedEmail: encrypted.encryptedEmail,
    updatedAt: serverTimestamp(),
  });
}

function toIsoString(val: unknown): string {
  if (val instanceof Timestamp) {
    return val.toDate().toISOString();
  }
  if (val && typeof (val as { toDate?: () => Date }).toDate === 'function') {
    return (val as { toDate: () => Date }).toDate().toISOString();
  }
  if (typeof val === 'string' && val) return val;
  return new Date().toISOString();
}

function mapUserProfileDoc(id: string, data: DocumentData): UserProfile {
  return {
    uid: typeof data.uid === 'string' && data.uid ? data.uid : id,
    username: typeof data.username === 'string' ? data.username : '',
    displayName: typeof data.displayName === 'string' ? data.displayName : 'Pengguna',
    role: ALLOWED_ROLES.has(data.role as SystemRole) ? (data.role as SystemRole) : 'pengguna',
    unit: typeof data.unit === 'string' ? data.unit : '',
    idNumber: typeof data.idNumber === 'string' ? data.idNumber : '',
    bio: typeof data.bio === 'string' ? data.bio : '',
    active: data.active !== false,
    createdAt: toIsoString(data.createdAt),
    updatedAt: toIsoString(data.updatedAt),
  };
}

function mapUserPrivateDoc(uid: string, data: DocumentData): UserPrivateInfo {
  return {
    uid: typeof data.uid === 'string' && data.uid ? data.uid : uid,
    email: typeof data.email === 'string' ? data.email : '',
    phone: typeof data.phone === 'string' ? data.phone : '',
    updatedAt: toIsoString(data.updatedAt),
  };
}

function mapUserInviteDoc(id: string, data: DocumentData): UserInvite {
  return {
    id,
    email: typeof data.email === 'string' ? data.email : '',
    displayName: typeof data.displayName === 'string' ? data.displayName : '',
    username: typeof data.username === 'string' ? data.username : '',
    role: ALLOWED_ROLES.has(data.role as SystemRole) ? (data.role as SystemRole) : 'guru',
    unit: typeof data.unit === 'string' ? data.unit : '',
    idNumber: typeof data.idNumber === 'string' ? data.idNumber : '',
    phone: typeof data.phone === 'string' ? data.phone : '',
    bio: typeof data.bio === 'string' ? data.bio : '',
    active: data.active !== false,
    claimed: data.claimed === true,
    claimedByUid: typeof data.claimedByUid === 'string' ? data.claimedByUid : '',
    invitedBy: typeof data.invitedBy === 'string' ? data.invitedBy : '',
    createdAt: toIsoString(data.createdAt),
    updatedAt: toIsoString(data.updatedAt),
  };
}

function mapAssetDoc(id: string, data: DocumentData): Asset {
  return {
    id,
    code: String(data.code ?? ''),
    name: String(data.name ?? ''),
    category: ALLOWED_ASSET_CATEGORIES.has(data.category as AssetCategory)
      ? (data.category as AssetCategory)
      : 'Lainnya',
    brand: String(data.brand ?? ''),
    condition: ALLOWED_ASSET_CONDITIONS.has(data.condition as AssetCondition)
      ? (data.condition as AssetCondition)
      : 'Baik',
    location: String(data.location ?? ''),
    fundingSource: String(data.fundingSource ?? ''),
    procurementYear: Number(data.procurementYear ?? 2026),
    nextMaintenanceDate: String(data.nextMaintenanceDate ?? ''),
    labScope: String(data.labScope ?? 'smkn1sambeng'),
    createdBy: String(data.createdBy ?? ''),
    createdAt: toIsoString(data.createdAt),
    updatedAt: toIsoString(data.updatedAt),
  };
}

function mapLoanDoc(id: string, data: DocumentData): Loan {
  return {
    id,
    assetId: String(data.assetId ?? ''),
    assetCode: String(data.assetCode ?? ''),
    assetName: String(data.assetName ?? ''),
    requesterId: String(data.requesterId ?? ''),
    borrowerName: String(data.borrowerName ?? ''),
    borrowerRole: ALLOWED_PERSON_ROLES.has(data.borrowerRole as PersonRole)
      ? (data.borrowerRole as PersonRole)
      : 'Guru',
    unit: String(data.unit ?? ''),
    borrowDate: String(data.borrowDate ?? ''),
    returnDate: String(data.returnDate ?? ''),
    lessonPeriod: String(data.lessonPeriod ?? ''),
    borrowTime: String(data.borrowTime ?? ''),
    returnTime: String(data.returnTime ?? ''),
    purpose: String(data.purpose ?? ''),
    status: ALLOWED_LOAN_STATUSES.has(data.status as LoanStatus)
      ? (data.status as LoanStatus)
      : 'Menunggu',
    notes: String(data.notes ?? ''),
    createdAt: toIsoString(data.createdAt),
    updatedAt: toIsoString(data.updatedAt),
  };
}

function mapScheduleDoc(id: string, data: DocumentData): LabSchedule {
  return {
    id,
    date: String(data.date ?? ''),
    startTime: String(data.startTime ?? ''),
    endTime: String(data.endTime ?? ''),
    activity: String(data.activity ?? ''),
    requesterId: String(data.requesterId ?? ''),
    requesterName: String(data.requesterName ?? ''),
    requesterRole: ALLOWED_PERSON_ROLES.has(data.requesterRole as PersonRole)
      ? (data.requesterRole as PersonRole)
      : 'Guru',
    unit: String(data.unit ?? ''),
    status: ALLOWED_SCHEDULE_STATUSES.has(data.status as ScheduleStatus)
      ? (data.status as ScheduleStatus)
      : 'Menunggu',
    labScope: String(data.labScope ?? 'smkn1sambeng'),
    createdAt: toIsoString(data.createdAt),
    updatedAt: toIsoString(data.updatedAt),
  };
}

function mapMaintenanceDoc(id: string, data: DocumentData): Maintenance {
  return {
    id,
    assetId: String(data.assetId ?? ''),
    assetCode: String(data.assetCode ?? ''),
    assetName: String(data.assetName ?? ''),
    issue: String(data.issue ?? ''),
    actionTaken: String(data.actionTaken ?? ''),
    technicianName: String(data.technicianName ?? ''),
    maintenanceDate: String(data.maintenanceDate ?? ''),
    status: ALLOWED_MAINTENANCE_STATUSES.has(data.status as MaintenanceStatus)
      ? (data.status as MaintenanceStatus)
      : 'Dijadwalkan',
    resultingCondition: ALLOWED_ASSET_CONDITIONS.has(data.resultingCondition as AssetCondition)
      ? (data.resultingCondition as AssetCondition)
      : 'Baik',
    createdBy: String(data.createdBy ?? ''),
    createdAt: toIsoString(data.createdAt),
    updatedAt: toIsoString(data.updatedAt),
  };
}

function mapAttendanceDoc(id: string, data: DocumentData): Attendance {
  return {
    id,
    userId: String(data.userId ?? ''),
    date: String(data.date ?? ''),
    checkInTime: String(data.checkInTime ?? ''),
    checkOutTime: String(data.checkOutTime ?? ''),
    visitorName: String(data.visitorName ?? ''),
    visitorRole: ALLOWED_PERSON_ROLES.has(data.visitorRole as PersonRole)
      ? (data.visitorRole as PersonRole)
      : 'Guru',
    unit: String(data.unit ?? ''),
    activity: String(data.activity ?? ''),
    workstation: String(data.workstation ?? ''),
    notes: String(data.notes ?? ''),
    createdAt: toIsoString(data.createdAt),
    updatedAt: toIsoString(data.updatedAt),
  };
}

function requireCurrentUser(): User {
  const u = auth.currentUser;
  if (!u) {
    throw new Error('Sesi belum aktif. Silakan masuk terlebih dahulu.');
  }
  return u;
}

async function getCurrentUserRole(uid: string): Promise<SystemRole> {
  const email = (auth.currentUser?.email || '').toLowerCase();
  if (auth.currentUser?.emailVerified && BOOTSTRAP_ADMIN_EMAILS.has(email)) return 'admin';
  const userPath = `users/${uid}`;
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (snap.exists()) {
      const role = snap.data().role as SystemRole;
      if (ALLOWED_ROLES.has(role)) return role;
    }
    return 'pengguna';
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, userPath);
  }
}

export async function signInWithGoogle(): Promise<User> {
  const res = await signInWithPopup(auth, googleProvider);
  return res.user;
}

export async function signInWithUsernameOrEmail(
  identifier: string,
  password: string
): Promise<User> {
  const raw = identifier.trim();
  if (!raw || !password) {
    throw new Error('Nama pengguna dan kata sandi wajib diisi.');
  }

  let loginEmail = '';
  if (raw.includes('@')) {
    loginEmail = raw.toLowerCase();
  } else {
    const usernameKey = sanitizeUsername(raw);
    if (!usernameKey) {
      throw new Error('Format nama pengguna tidak valid.');
    }
    let envSnap;
    try {
      envSnap = await getDoc(doc(db, 'username_auth', usernameKey));
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `username_auth/${usernameKey}`);
    }
    if (!envSnap.exists()) {
      throw new Error('Nama pengguna tidak ditemukan atau belum memiliki kata sandi.');
    }
    const envData = envSnap.data();
    try {
      loginEmail = await decryptEmailEnvelope(usernameKey, password, {
        salt: String(envData.salt ?? ''),
        iv: String(envData.iv ?? ''),
        encryptedEmail: String(envData.encryptedEmail ?? ''),
      });
    } catch {
      throw new Error('Nama pengguna atau kata sandi salah.');
    }
  }

  const res = await signInWithEmailAndPassword(auth, loginEmail, password);
  return res.user;
}

let activeRegistrationPromise: Promise<unknown> | null = null;

export async function registerWithUsernamePassword(input: {
  displayName: string;
  username: string;
  password: string;
  role: SystemRole;
  unit: string;
  idNumber?: string;
  phone?: string;
  email?: string;
}): Promise<{ profile: UserProfile; privateInfo: UserPrivateInfo }> {
  const displayName = clampStr(input.displayName, 80);
  const usernameKey = sanitizeUsername(input.username);
  const password = input.password;
  const role: SystemRole = ALLOWED_SELF_ROLES.has(input.role) ? input.role : 'guru';
  const unit = clampStr(input.unit, 60);
  const idNumber = clampStr(input.idNumber ?? '', 40);
  const phone = clampStr(input.phone ?? '', 30);
  const optionalEmail = clampStr(input.email ?? '', 120).toLowerCase();

  if (!displayName) throw new Error('Nama lengkap wajib diisi.');
  if (!usernameKey) {
    throw new Error('Nama pengguna wajib diisi (huruf kecil, angka, titik, atau strip).');
  }
  if (!password || password.length < 6) {
    throw new Error('Kata sandi minimal 6 karakter.');
  }

  const envRef = doc(db, 'username_auth', usernameKey);
  const existingEnv = await getDoc(envRef);
  if (existingEnv.exists()) {
    throw new Error(`Nama pengguna "${usernameKey}" sudah digunakan.`);
  }

  const authEmail =
    optionalEmail && optionalEmail.includes('@')
      ? optionalEmail
      : `${usernameKey}@sipalak.smkn1sambeng.local`;

  const task = (async () => {
    const cred = await createUserWithEmailAndPassword(auth, authEmail, password);
    const uid = cred.user.uid;
    const userDocRef = doc(db, 'users', uid);
    const privateDocRef = doc(db, 'users', uid, 'private', 'info');

    try {
      await setDoc(userDocRef, {
        uid,
        displayName,
        username: usernameKey,
        role,
        unit,
        idNumber,
        bio: '',
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `users/${uid}`);
    }

    try {
      await setDoc(privateDocRef, {
        uid,
        email: optionalEmail || authEmail,
        phone,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `users/${uid}/private/info`);
    }

    try {
      await upsertUsernameEnvelope(uid, usernameKey, password, authEmail);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `username_auth/${usernameKey}`);
    }

    const [freshSnap, freshPriv] = await Promise.all([getDoc(userDocRef), getDoc(privateDocRef)]);
    return {
      profile: mapUserProfileDoc(uid, freshSnap.data() ?? {}),
      privateInfo: mapUserPrivateDoc(
        uid,
        freshPriv.data() ?? { email: optionalEmail || authEmail, phone }
      ),
    };
  })();

  activeRegistrationPromise = task;
  try {
    return await task;
  } finally {
    if (activeRegistrationPromise === task) {
      activeRegistrationPromise = null;
    }
  }
}

export async function signOutFirebase(): Promise<void> {
  await signOut(auth);
}

export type SessionResolution =
  | { status: 'ready'; profile: UserProfile; privateInfo: UserPrivateInfo }
  | { status: 'needs_onboarding'; email: string; displayName: string };

export async function resolveFirebaseSession(user: User): Promise<SessionResolution> {
  if (activeRegistrationPromise) {
    await activeRegistrationPromise.catch(() => {});
  }
  const uid = user.uid;
  const email = (user.email || '').trim().toLowerCase();
  const userDocRef = doc(db, 'users', uid);
  const privateDocRef = doc(db, 'users', uid, 'private', 'info');

  let userSnap;
  try {
    userSnap = await getDoc(userDocRef);
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `users/${uid}`);
  }

  if (userSnap.exists()) {
    const profile = mapUserProfileDoc(uid, userSnap.data());
    if (!profile.active) {
      await signOut(auth);
      throw new Error('Akun Anda telah dinonaktifkan oleh Administrator.');
    }

    let privateSnap;
    try {
      privateSnap = await getDoc(privateDocRef);
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `users/${uid}/private/info`);
    }

    let privateInfo: UserPrivateInfo;
    if (privateSnap.exists()) {
      privateInfo = mapUserPrivateDoc(uid, privateSnap.data());
    } else {
      const payload = {
        uid,
        email: clampStr(email, 120),
        phone: '',
        updatedAt: serverTimestamp(),
      };
      try {
        await setDoc(privateDocRef, payload);
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `users/${uid}/private/info`);
      }
      privateInfo = {
        uid,
        email: clampStr(email, 120),
        phone: '',
        updatedAt: new Date().toISOString(),
      };
    }

    return { status: 'ready', profile, privateInfo };
  }

  // First-time user: check bootstrapped admin (verified email only)
  if (user.emailVerified && BOOTSTRAP_ADMIN_EMAILS.has(email)) {
    const displayName = clampStr(user.displayName || 'Administrator Lab', 80);
    const username = sanitizeUsername(email.split('@')[0] || 'admin');
    try {
      await setDoc(userDocRef, {
        uid,
        displayName,
        username,
        role: 'admin',
        unit: 'Lab Komputer Akuntansi',
        idNumber: '',
        bio: 'Administrator SIPALAK',
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `users/${uid}`);
    }

    try {
      await setDoc(doc(db, 'admins', uid), {
        uid,
        grantedBy: uid,
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `admins/${uid}`);
    }

    try {
      await setDoc(privateDocRef, {
        uid,
        email: clampStr(email, 120),
        phone: '',
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `users/${uid}/private/info`);
    }

    const freshSnap = await getDoc(userDocRef);
    const freshPriv = await getDoc(privateDocRef);
    return {
      status: 'ready',
      profile: mapUserProfileDoc(uid, freshSnap.data() ?? {}),
      privateInfo: mapUserPrivateDoc(uid, freshPriv.data() ?? { email }),
    };
  }

  // Check unclaimed pre-registered invite matching verified email
  if (user.emailVerified && email) {
    let inviteSnapList;
    try {
      inviteSnapList = await getDocs(
        query(collection(db, 'user_invites'), where('email', '==', email))
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'user_invites');
    }

    const pendingInvite = inviteSnapList.docs.find((d) => d.data().claimed === false);
    if (pendingInvite) {
      const inv = pendingInvite.data();
      const invRole = ALLOWED_ROLES.has(inv.role as SystemRole)
        ? (inv.role as SystemRole)
        : 'guru';
      const invActive = inv.active !== false;
      const username = sanitizeUsername(inv.username || email.split('@')[0] || 'user');

      try {
        await setDoc(userDocRef, {
          uid,
          inviteId: pendingInvite.id,
          displayName: clampStr(inv.displayName || user.displayName || 'Pengguna', 80),
          username,
          role: invRole,
          unit: clampStr(inv.unit || '', 60),
          idNumber: clampStr(inv.idNumber || '', 40),
          bio: clampStr(inv.bio || '', 240),
          active: invActive,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `users/${uid}`);
      }

      if (invRole === 'admin') {
        try {
          await setDoc(doc(db, 'admins', uid), {
            uid,
            grantedBy: String(inv.invitedBy || uid),
            createdAt: serverTimestamp(),
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.CREATE, `admins/${uid}`);
        }
      }

      try {
        await updateDoc(doc(db, 'user_invites', pendingInvite.id), {
          claimed: true,
          claimedByUid: uid,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `user_invites/${pendingInvite.id}`);
      }

      try {
        await setDoc(privateDocRef, {
          uid,
          email: clampStr(email, 120),
          phone: clampStr(inv.phone || '', 30),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `users/${uid}/private/info`);
      }

      if (!invActive) {
        await signOut(auth);
        throw new Error('Akun Anda berstatus nonaktif. Hubungi Administrator Lab.');
      }

      const freshSnap = await getDoc(userDocRef);
      const freshPriv = await getDoc(privateDocRef);
      return {
        status: 'ready',
        profile: mapUserProfileDoc(uid, freshSnap.data() ?? {}),
        privateInfo: mapUserPrivateDoc(uid, freshPriv.data() ?? { email }),
      };
    }
  }

  return {
    status: 'needs_onboarding',
    email,
    displayName: clampStr(user.displayName || '', 80),
  };
}

export async function completeSelfRegistration(input: {
  displayName: string;
  username?: string;
  role: SystemRole;
  unit: string;
  idNumber?: string;
  phone?: string;
  bio?: string;
}): Promise<{ profile: UserProfile; privateInfo: UserPrivateInfo }> {
  const user = requireCurrentUser();
  const uid = user.uid;
  const email = clampStr((user.email || '').toLowerCase(), 120);
  const role: SystemRole = ALLOWED_SELF_ROLES.has(input.role) ? input.role : 'pengguna';
  const displayName = clampStr(input.displayName || user.displayName || 'Pengguna', 80);
  const username = sanitizeUsername(input.username || email.split('@')[0] || uid.slice(0, 12));
  const unit = clampStr(input.unit, 60);
  const idNumber = clampStr(input.idNumber ?? '', 40);
  const phone = clampStr(input.phone ?? '', 30);
  const bio = clampStr(input.bio ?? '', 240);

  if (!displayName) {
    throw new Error('Nama lengkap wajib diisi.');
  }

  const userDocRef = doc(db, 'users', uid);
  const privateDocRef = doc(db, 'users', uid, 'private', 'info');

  try {
    await setDoc(userDocRef, {
      uid,
      displayName,
      username,
      role,
      unit,
      idNumber,
      bio,
      active: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `users/${uid}`);
  }

  try {
    await setDoc(privateDocRef, {
      uid,
      email,
      phone,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `users/${uid}/private/info`);
  }

  const freshSnap = await getDoc(userDocRef);
  const freshPriv = await getDoc(privateDocRef);
  return {
    profile: mapUserProfileDoc(uid, freshSnap.data() ?? {}),
    privateInfo: mapUserPrivateDoc(uid, freshPriv.data() ?? { email, phone }),
  };
}

export async function getFirestoreBranding(): Promise<BrandingSettings> {
  const path = 'settings/branding';
  try {
    const snap = await getDoc(doc(db, 'settings', 'branding'));
    if (!snap.exists()) return { ...DEFAULT_BRANDING };
    const d = snap.data();
    return {
      appName: clampStr(d.appName, 40) || DEFAULT_BRANDING.appName,
      appSubtitle: clampStr(d.appSubtitle, 120) || DEFAULT_BRANDING.appSubtitle,
      schoolName: clampStr(d.schoolName, 100) || DEFAULT_BRANDING.schoolName,
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }
}

export function subscribeFirestoreBranding(
  onData: (branding: BrandingSettings) => void
): Unsubscribe {
  return onSnapshot(
    doc(db, 'settings', 'branding'),
    (snap) => {
      if (!snap.exists()) {
        onData({ ...DEFAULT_BRANDING });
        return;
      }
      const d = snap.data();
      onData({
        appName: clampStr(d.appName, 40) || DEFAULT_BRANDING.appName,
        appSubtitle: clampStr(d.appSubtitle, 120) || DEFAULT_BRANDING.appSubtitle,
        schoolName: clampStr(d.schoolName, 100) || DEFAULT_BRANDING.schoolName,
      });
    },
    (err) => {
      handleFirestoreError(err, OperationType.GET, 'settings/branding');
    }
  );
}

export async function saveFirestoreBranding(next: BrandingSettings): Promise<BrandingSettings> {
  const appName = clampStr(next.appName, 40);
  const appSubtitle = clampStr(next.appSubtitle, 120);
  const schoolName = clampStr(next.schoolName, 100);
  if (!appName || !appSubtitle || !schoolName) {
    throw new Error('Nama aplikasi, subjudul, dan nama instansi wajib diisi.');
  }
  const path = 'settings/branding';
  try {
    await setDoc(doc(db, 'settings', 'branding'), {
      appName,
      appSubtitle,
      schoolName,
      updatedAt: serverTimestamp(),
    });
    return { appName, appSubtitle, schoolName };
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function fetchFirestoreSnapshot(uid: string, isAdmin: boolean): Promise<AppDataSnapshot> {
  try {
    const [assetsSnap, loansSnap, schedulesSnap, maintSnap, attSnap, usersSnap, invitesSnap] =
      await Promise.all([
        getDocs(query(collection(db, 'assets'), where('labScope', '==', 'smkn1sambeng'))),
        getDocs(
          isAdmin
            ? collection(db, 'loans')
            : query(collection(db, 'loans'), where('requesterId', '==', uid))
        ),
        getDocs(query(collection(db, 'schedules'), where('labScope', '==', 'smkn1sambeng'))),
        getDocs(
          isAdmin
            ? collection(db, 'maintenances')
            : query(collection(db, 'maintenances'), where('createdBy', '==', uid))
        ),
        getDocs(
          isAdmin
            ? collection(db, 'attendances')
            : query(collection(db, 'attendances'), where('userId', '==', uid))
        ),
        getDocs(
          isAdmin
            ? collection(db, 'users')
            : query(collection(db, 'users'), where('uid', '==', uid))
        ),
        isAdmin
          ? getDocs(query(collection(db, 'user_invites'), where('claimed', '==', false)))
          : Promise.resolve(null),
      ]);

    const assets = assetsSnap.docs
      .map((d) => mapAssetDoc(d.id, d.data()))
      .sort((a, b) => a.code.localeCompare(b.code));
    const loans = loansSnap.docs
      .map((d) => mapLoanDoc(d.id, d.data()))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const schedules = schedulesSnap.docs
      .map((d) => mapScheduleDoc(d.id, d.data()))
      .sort((a, b) => `${b.date}${b.startTime}`.localeCompare(`${a.date}${a.startTime}`));
    const maintenances = maintSnap.docs
      .map((d) => mapMaintenanceDoc(d.id, d.data()))
      .sort((a, b) => b.maintenanceDate.localeCompare(a.maintenanceDate));
    const attendances = attSnap.docs
      .map((d) => mapAttendanceDoc(d.id, d.data()))
      .sort((a, b) => `${b.date}${b.checkInTime}`.localeCompare(`${a.date}${a.checkInTime}`));
    const users = usersSnap.docs
      .map((d) => mapUserProfileDoc(d.id, d.data()))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
    const invites = invitesSnap
      ? invitesSnap.docs
          .map((d) => mapUserInviteDoc(d.id, d.data()))
          .sort((a, b) => a.displayName.localeCompare(b.displayName))
      : [];

    return { assets, loans, schedules, maintenances, attendances, users, invites };
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'snapshot');
  }
}

export function subscribeFirestoreSnapshot(
  uid: string,
  isAdmin: boolean,
  onUpdate: (updater: (prev: AppDataSnapshot) => AppDataSnapshot) => void,
  onError: (err: unknown) => void
): Unsubscribe {
  const unsubs: Unsubscribe[] = [];

  unsubs.push(
    onSnapshot(
      query(collection(db, 'assets'), where('labScope', '==', 'smkn1sambeng')),
      (snap) => {
        const assets = snap.docs
          .map((d) => mapAssetDoc(d.id, d.data()))
          .sort((a, b) => a.code.localeCompare(b.code));
        onUpdate((prev) => ({ ...prev, assets }));
      },
      (err) => {
        onError(err);
        handleFirestoreError(err, OperationType.LIST, 'assets');
      }
    )
  );

  unsubs.push(
    onSnapshot(
      isAdmin
        ? collection(db, 'loans')
        : query(collection(db, 'loans'), where('requesterId', '==', uid)),
      (snap) => {
        const loans = snap.docs
          .map((d) => mapLoanDoc(d.id, d.data()))
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        onUpdate((prev) => ({ ...prev, loans }));
      },
      (err) => {
        onError(err);
        handleFirestoreError(err, OperationType.LIST, 'loans');
      }
    )
  );

  unsubs.push(
    onSnapshot(
      query(collection(db, 'schedules'), where('labScope', '==', 'smkn1sambeng')),
      (snap) => {
        const schedules = snap.docs
          .map((d) => mapScheduleDoc(d.id, d.data()))
          .sort((a, b) => `${b.date}${b.startTime}`.localeCompare(`${a.date}${a.startTime}`));
        onUpdate((prev) => ({ ...prev, schedules }));
      },
      (err) => {
        onError(err);
        handleFirestoreError(err, OperationType.LIST, 'schedules');
      }
    )
  );

  unsubs.push(
    onSnapshot(
      isAdmin
        ? collection(db, 'maintenances')
        : query(collection(db, 'maintenances'), where('createdBy', '==', uid)),
      (snap) => {
        const maintenances = snap.docs
          .map((d) => mapMaintenanceDoc(d.id, d.data()))
          .sort((a, b) => b.maintenanceDate.localeCompare(a.maintenanceDate));
        onUpdate((prev) => ({ ...prev, maintenances }));
      },
      (err) => {
        onError(err);
        handleFirestoreError(err, OperationType.LIST, 'maintenances');
      }
    )
  );

  unsubs.push(
    onSnapshot(
      isAdmin
        ? collection(db, 'attendances')
        : query(collection(db, 'attendances'), where('userId', '==', uid)),
      (snap) => {
        const attendances = snap.docs
          .map((d) => mapAttendanceDoc(d.id, d.data()))
          .sort((a, b) => `${b.date}${b.checkInTime}`.localeCompare(`${a.date}${a.checkInTime}`));
        onUpdate((prev) => ({ ...prev, attendances }));
      },
      (err) => {
        onError(err);
        handleFirestoreError(err, OperationType.LIST, 'attendances');
      }
    )
  );

  unsubs.push(
    onSnapshot(
      isAdmin
        ? collection(db, 'users')
        : query(collection(db, 'users'), where('uid', '==', uid)),
      (snap) => {
        const users = snap.docs
          .map((d) => mapUserProfileDoc(d.id, d.data()))
          .sort((a, b) => a.displayName.localeCompare(b.displayName));
        onUpdate((prev) => ({ ...prev, users }));
      },
      (err) => {
        onError(err);
        handleFirestoreError(err, OperationType.LIST, 'users');
      }
    )
  );

  if (isAdmin) {
    unsubs.push(
      onSnapshot(
        query(collection(db, 'user_invites'), where('claimed', '==', false)),
        (snap) => {
          const invites = snap.docs
            .map((d) => mapUserInviteDoc(d.id, d.data()))
            .sort((a, b) => a.displayName.localeCompare(b.displayName));
          onUpdate((prev) => ({ ...prev, invites }));
        },
        (err) => {
          onError(err);
          handleFirestoreError(err, OperationType.LIST, 'user_invites');
        }
      )
    );
  }

  return () => {
    for (const unsub of unsubs) {
      unsub();
    }
  };
}

export async function updateOwnProfile(payload: Record<string, unknown>): Promise<{
  passwordUpdated: boolean;
  profile: UserProfile;
  privateInfo: UserPrivateInfo;
}> {
  const user = requireCurrentUser();
  const uid = user.uid;
  const userDocRef = doc(db, 'users', uid);
  const privateDocRef = doc(db, 'users', uid, 'private', 'info');

  let existingSnap;
  try {
    existingSnap = await getDoc(userDocRef);
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `users/${uid}`);
  }
  if (!existingSnap.exists()) {
    throw new Error('Profil pengguna tidak ditemukan.');
  }
  const current = mapUserProfileDoc(uid, existingSnap.data());

  const displayName = clampStr(payload.displayName, 80) || current.displayName;
  const username =
    payload.username !== undefined ? sanitizeUsername(payload.username) : current.username;
  const unit = payload.unit !== undefined ? clampStr(payload.unit, 60) : current.unit;
  const idNumber =
    payload.idNumber !== undefined ? clampStr(payload.idNumber, 40) : current.idNumber;
  const bio = payload.bio !== undefined ? clampStr(payload.bio, 240) : current.bio;

  const updateBody: Record<string, unknown> = {
    displayName,
    username,
    unit,
    idNumber,
    bio,
    updatedAt: serverTimestamp(),
  };

  if (
    ALLOWED_SELF_ROLES.has(current.role) &&
    typeof payload.role === 'string' &&
    ALLOWED_SELF_ROLES.has(payload.role as SystemRole)
  ) {
    updateBody.role = payload.role;
  }

  try {
    await updateDoc(userDocRef, updateBody);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `users/${uid}`);
  }

  const privSnap = await getDoc(privateDocRef);
  const existingPriv = privSnap.exists()
    ? mapUserPrivateDoc(uid, privSnap.data())
    : { uid, email: (user.email || '').toLowerCase(), phone: '', updatedAt: '' };
  const email =
    payload.email !== undefined ? clampStr(payload.email, 120).toLowerCase() : existingPriv.email;
  const phone = payload.phone !== undefined ? clampStr(payload.phone, 30) : existingPriv.phone;

  try {
    await setDoc(privateDocRef, {
      uid,
      email,
      phone,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `users/${uid}/private/info`);
  }

  let passwordUpdated = false;
  const newPassword = typeof payload.newPassword === 'string' ? payload.newPassword : '';
  if (newPassword) {
    if (newPassword.length < 6) {
      throw new Error('Kata sandi baru minimal 6 karakter.');
    }
    const authEmail = (user.email || email || '').trim().toLowerCase();
    if (!authEmail) {
      throw new Error('Akun ini belum memiliki alamat email untuk login kata sandi.');
    }
    const hasPasswordProvider = user.providerData.some((p) => p.providerId === 'password');
    if (hasPasswordProvider) {
      await updatePassword(user, newPassword);
    } else {
      const cred = EmailAuthProvider.credential(authEmail, newPassword);
      await linkWithCredential(user, cred);
    }

    const activeUsername = sanitizeUsername(username || current.username || authEmail.split('@')[0]);
    if (activeUsername) {
      if (current.username && current.username !== activeUsername) {
        const oldRef = doc(db, 'username_auth', current.username);
        const oldSnap = await getDoc(oldRef);
        if (oldSnap.exists() && oldSnap.data().uid === uid) {
          await deleteDoc(oldRef).catch(() => {});
        }
      }
      await upsertUsernameEnvelope(uid, activeUsername, newPassword, authEmail);
    }
    passwordUpdated = true;
  }

  const [updatedUserSnap, updatedPrivSnap] = await Promise.all([
    getDoc(userDocRef),
    getDoc(privateDocRef),
  ]);

  return {
    passwordUpdated,
    profile: mapUserProfileDoc(uid, updatedUserSnap.data() ?? {}),
    privateInfo: mapUserPrivateDoc(uid, updatedPrivSnap.data() ?? {}),
  };
}

export async function handleFirebaseApiRequest<T>(
  path: string,
  method: string,
  body: Record<string, unknown>
): Promise<T> {
  const m = method.toUpperCase();
  const user = requireCurrentUser();
  const uid = user.uid;
  const role = await getCurrentUserRole(uid);
  const isAdmin = role === 'admin';

  // --- ASSETS ---
  if (path === '/api/assets' && m === 'POST') {
    if (!isAdmin) throw new Error('Hanya Administrator Lab yang dapat menambah aset.');
    const code = clampStr(body.code, 50);
    const name = clampStr(body.name, 100);
    const category = String(body.category || 'Komputer') as AssetCategory;
    const brand = clampStr(body.brand, 80);
    const condition = String(body.condition || 'Baik') as AssetCondition;
    const location = clampStr(body.location, 100);
    const fundingSource = clampStr(body.fundingSource, 80);
    const procurementYear = Math.min(
      2100,
      Math.max(1990, Math.round(Number(body.procurementYear) || 2026))
    );
    const nextMaintenanceDate = clampStr(body.nextMaintenanceDate, 20);

    if (
      !code ||
      !name ||
      !brand ||
      !location ||
      !ALLOWED_ASSET_CATEGORIES.has(category) ||
      !ALLOWED_ASSET_CONDITIONS.has(condition)
    ) {
      throw new Error('Data aset belum lengkap atau tidak valid.');
    }

    try {
      const ref = await addDoc(collection(db, 'assets'), {
        code,
        name,
        category,
        brand,
        condition,
        location,
        fundingSource,
        procurementYear,
        nextMaintenanceDate,
        labScope: 'smkn1sambeng',
        createdBy: uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return { id: ref.id } as T;
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'assets');
    }
  }

  if (path === '/api/assets/seed-samples' && m === 'POST') {
    if (!isAdmin) throw new Error('Hanya Administrator Lab yang dapat memuat contoh aset.');
    const samples = [
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
        fundingSource: 'APBD',
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
        fundingSource: 'BOS',
        procurementYear: 2025,
        nextMaintenanceDate: '',
      },
    ];
    try {
      const batch = writeBatch(db);
      for (const s of samples) {
        const ref = doc(collection(db, 'assets'));
        batch.set(ref, {
          ...s,
          labScope: 'smkn1sambeng',
          createdBy: uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();
      return { ok: true } as T;
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'assets');
    }
  }

  if (path.startsWith('/api/assets/') && m === 'PUT') {
    if (!isAdmin) throw new Error('Hanya Administrator Lab yang dapat mengubah aset.');
    const id = path.slice('/api/assets/'.length);
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
      throw new Error('Data aset tidak valid.');
    }
    try {
      await updateDoc(doc(db, 'assets', id), {
        code,
        name,
        category,
        brand,
        condition,
        location,
        fundingSource: clampStr(body.fundingSource, 80),
        procurementYear: Math.min(
          2100,
          Math.max(1990, Math.round(Number(body.procurementYear) || 2026))
        ),
        nextMaintenanceDate: clampStr(body.nextMaintenanceDate, 20),
        updatedAt: serverTimestamp(),
      });
      return { ok: true } as T;
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `assets/${id}`);
    }
  }

  if (path.startsWith('/api/assets/') && m === 'DELETE') {
    if (!isAdmin) throw new Error('Hanya Administrator Lab yang dapat menghapus aset.');
    const id = path.slice('/api/assets/'.length);
    try {
      await deleteDoc(doc(db, 'assets', id));
      return { ok: true } as T;
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `assets/${id}`);
    }
  }

  // --- LOANS ---
  if (path === '/api/loans' && m === 'POST') {
    const assetId = clampStr(body.assetId, 128);
    let assetSnap;
    try {
      assetSnap = await getDoc(doc(db, 'assets', assetId));
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `assets/${assetId}`);
    }
    if (!assetSnap.exists()) {
      throw new Error('Aset yang dipilih tidak ditemukan.');
    }
    const assetData = assetSnap.data();

    const borrowerName = clampStr(body.borrowerName, 80);
    const borrowerRole = (
      role === 'guru' ? 'Guru' : String(body.borrowerRole || 'Guru')
    ) as PersonRole;
    const unit = clampStr(body.unit, 60);
    const borrowDate = clampStr(body.borrowDate, 20);
    const returnDate = clampStr(body.returnDate, 20);
    const lessonPeriod = clampStr(body.lessonPeriod, 40);
    const borrowTime = clampStr(body.borrowTime, 10);
    const returnTime = clampStr(body.returnTime, 10);
    const purpose = clampStr(body.purpose, 240);
    const notes = clampStr(body.notes, 240);

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
      throw new Error('Data peminjaman belum lengkap.');
    }

    try {
      const ref = await addDoc(collection(db, 'loans'), {
        assetId,
        assetCode: clampStr(assetData.code, 50),
        assetName: clampStr(assetData.name, 100),
        requesterId: uid,
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
        notes,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return { id: ref.id } as T;
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'loans');
    }
  }

  if (path.startsWith('/api/loans/') && m === 'PUT') {
    const id = path.slice('/api/loans/'.length);
    const loanRef = doc(db, 'loans', id);
    let existingSnap;
    try {
      existingSnap = await getDoc(loanRef);
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `loans/${id}`);
    }
    if (!existingSnap.exists()) throw new Error('Data peminjaman tidak ditemukan.');
    const existing = existingSnap.data();

    try {
      if (isAdmin) {
        const status = String(body.status || existing.status) as LoanStatus;
        if (!ALLOWED_LOAN_STATUSES.has(status)) {
          throw new Error('Status peminjaman tidak valid.');
        }
        await updateDoc(loanRef, {
          status,
          notes: body.notes !== undefined ? clampStr(body.notes, 240) : String(existing.notes ?? ''),
          returnDate:
            body.returnDate !== undefined
              ? clampStr(body.returnDate, 20)
              : String(existing.returnDate ?? ''),
          updatedAt: serverTimestamp(),
        });
      } else {
        if (existing.requesterId !== uid) {
          throw new Error('Anda tidak memiliki izin mengubah peminjaman ini.');
        }
        if (existing.status !== 'Menunggu') {
          throw new Error('Peminjaman yang sudah diproses tidak dapat diubah.');
        }
        await updateDoc(loanRef, {
          borrowDate: clampStr(body.borrowDate, 20) || String(existing.borrowDate),
          returnDate: clampStr(body.returnDate, 20) || String(existing.returnDate),
          lessonPeriod: clampStr(body.lessonPeriod, 40) || String(existing.lessonPeriod ?? ''),
          borrowTime: clampStr(body.borrowTime, 10) || String(existing.borrowTime ?? ''),
          returnTime: clampStr(body.returnTime, 10) || String(existing.returnTime ?? ''),
          purpose: clampStr(body.purpose, 240) || String(existing.purpose),
          notes: body.notes !== undefined ? clampStr(body.notes, 240) : String(existing.notes ?? ''),
          updatedAt: serverTimestamp(),
        });
      }
      return { ok: true } as T;
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `loans/${id}`);
    }
  }

  if (path.startsWith('/api/loans/') && m === 'DELETE') {
    const id = path.slice('/api/loans/'.length);
    try {
      await deleteDoc(doc(db, 'loans', id));
      return { ok: true } as T;
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `loans/${id}`);
    }
  }

  // --- SCHEDULES ---
  if (path === '/api/schedules' && m === 'POST') {
    const date = clampStr(body.date, 20);
    const startTime = clampStr(body.startTime, 10);
    const endTime = clampStr(body.endTime, 10);
    const activity = clampStr(body.activity, 120);
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
      throw new Error('Data jadwal belum lengkap.');
    }
    try {
      const ref = await addDoc(collection(db, 'schedules'), {
        date,
        startTime,
        endTime,
        activity,
        requesterId: uid,
        requesterName,
        requesterRole,
        unit,
        status: 'Menunggu',
        labScope: 'smkn1sambeng',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return { id: ref.id } as T;
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'schedules');
    }
  }

  if (path.startsWith('/api/schedules/') && m === 'PUT') {
    const id = path.slice('/api/schedules/'.length);
    const schRef = doc(db, 'schedules', id);
    const existingSnap = await getDoc(schRef);
    if (!existingSnap.exists()) throw new Error('Jadwal tidak ditemukan.');
    const existing = existingSnap.data();

    try {
      if (isAdmin) {
        const status = String(body.status || existing.status) as ScheduleStatus;
        if (!ALLOWED_SCHEDULE_STATUSES.has(status)) throw new Error('Status jadwal tidak valid.');
        await updateDoc(schRef, {
          status,
          date: clampStr(body.date, 20) || String(existing.date),
          startTime: clampStr(body.startTime, 10) || String(existing.startTime),
          endTime: clampStr(body.endTime, 10) || String(existing.endTime),
          activity: clampStr(body.activity, 120) || String(existing.activity),
          unit: clampStr(body.unit, 60) || String(existing.unit),
          updatedAt: serverTimestamp(),
        });
      } else {
        if (existing.requesterId !== uid) {
          throw new Error('Anda tidak memiliki izin mengubah jadwal ini.');
        }
        if (existing.status !== 'Menunggu') {
          throw new Error('Jadwal yang sudah diproses tidak dapat diubah.');
        }
        await updateDoc(schRef, {
          date: clampStr(body.date, 20) || String(existing.date),
          startTime: clampStr(body.startTime, 10) || String(existing.startTime),
          endTime: clampStr(body.endTime, 10) || String(existing.endTime),
          activity: clampStr(body.activity, 120) || String(existing.activity),
          unit: clampStr(body.unit, 60) || String(existing.unit),
          updatedAt: serverTimestamp(),
        });
      }
      return { ok: true } as T;
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `schedules/${id}`);
    }
  }

  if (path.startsWith('/api/schedules/') && m === 'DELETE') {
    const id = path.slice('/api/schedules/'.length);
    try {
      await deleteDoc(doc(db, 'schedules', id));
      return { ok: true } as T;
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `schedules/${id}`);
    }
  }

  // --- MAINTENANCES ---
  if (path === '/api/maintenances' && m === 'POST') {
    if (!isAdmin) throw new Error('Hanya Administrator Lab yang dapat mencatat perawatan.');
    const assetId = clampStr(body.assetId, 128);
    const assetSnap = await getDoc(doc(db, 'assets', assetId));
    if (!assetSnap.exists()) throw new Error('Aset tidak ditemukan.');
    const assetData = assetSnap.data();

    const issue = clampStr(body.issue, 240);
    const actionTaken = clampStr(body.actionTaken, 240);
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
      throw new Error('Data perawatan belum lengkap.');
    }

    try {
      const ref = await addDoc(collection(db, 'maintenances'), {
        assetId,
        assetCode: clampStr(assetData.code, 50),
        assetName: clampStr(assetData.name, 100),
        issue,
        actionTaken,
        technicianName,
        maintenanceDate,
        status,
        resultingCondition,
        createdBy: uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      if (body.syncAssetCondition) {
        await updateDoc(doc(db, 'assets', assetId), {
          code: clampStr(assetData.code, 50),
          name: clampStr(assetData.name, 100),
          category: assetData.category,
          brand: clampStr(assetData.brand, 80),
          condition: resultingCondition,
          location: clampStr(assetData.location, 100),
          fundingSource: clampStr(assetData.fundingSource ?? '', 80),
          procurementYear: Number(assetData.procurementYear ?? 2026),
          nextMaintenanceDate: clampStr(assetData.nextMaintenanceDate ?? '', 20),
          updatedAt: serverTimestamp(),
        });
      }
      return { id: ref.id } as T;
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'maintenances');
    }
  }

  if (path.startsWith('/api/maintenances/') && m === 'PUT') {
    if (!isAdmin) throw new Error('Hanya Administrator Lab yang dapat memperbarui perawatan.');
    const id = path.slice('/api/maintenances/'.length);
    const maintRef = doc(db, 'maintenances', id);
    const existingSnap = await getDoc(maintRef);
    if (!existingSnap.exists()) throw new Error('Catatan perawatan tidak ditemukan.');
    const existing = existingSnap.data();

    const issue = clampStr(body.issue, 240) || String(existing.issue);
    const actionTaken =
      body.actionTaken !== undefined
        ? clampStr(body.actionTaken, 240)
        : String(existing.actionTaken ?? '');
    const technicianName = clampStr(body.technicianName, 80) || String(existing.technicianName);
    const maintenanceDate = clampStr(body.maintenanceDate, 20) || String(existing.maintenanceDate);
    const status = String(body.status || existing.status) as MaintenanceStatus;
    const resultingCondition = String(
      body.resultingCondition || existing.resultingCondition
    ) as AssetCondition;

    if (
      !ALLOWED_MAINTENANCE_STATUSES.has(status) ||
      !ALLOWED_ASSET_CONDITIONS.has(resultingCondition)
    ) {
      throw new Error('Status atau kondisi hasil tidak valid.');
    }

    try {
      await updateDoc(maintRef, {
        issue,
        actionTaken,
        technicianName,
        maintenanceDate,
        status,
        resultingCondition,
        updatedAt: serverTimestamp(),
      });

      if (body.syncAssetCondition && typeof existing.assetId === 'string') {
        const assetRef = doc(db, 'assets', existing.assetId);
        const assetSnap = await getDoc(assetRef);
        if (assetSnap.exists()) {
          const assetData = assetSnap.data();
          await updateDoc(assetRef, {
            code: clampStr(assetData.code, 50),
            name: clampStr(assetData.name, 100),
            category: assetData.category,
            brand: clampStr(assetData.brand, 80),
            condition: resultingCondition,
            location: clampStr(assetData.location, 100),
            fundingSource: clampStr(assetData.fundingSource ?? '', 80),
            procurementYear: Number(assetData.procurementYear ?? 2026),
            nextMaintenanceDate: clampStr(assetData.nextMaintenanceDate ?? '', 20),
            updatedAt: serverTimestamp(),
          });
        }
      }
      return { ok: true } as T;
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `maintenances/${id}`);
    }
  }

  if (path.startsWith('/api/maintenances/') && m === 'DELETE') {
    if (!isAdmin) throw new Error('Hanya Administrator Lab yang dapat menghapus perawatan.');
    const id = path.slice('/api/maintenances/'.length);
    try {
      await deleteDoc(doc(db, 'maintenances', id));
      return { ok: true } as T;
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `maintenances/${id}`);
    }
  }

  // --- ATTENDANCES ---
  if (path === '/api/attendances' && m === 'POST') {
    const date = clampStr(body.date, 20);
    const checkInTime = clampStr(body.checkInTime, 10);
    const checkOutTime = clampStr(body.checkOutTime, 10);
    const visitorName = clampStr(body.visitorName, 80);
    const visitorRole = String(body.visitorRole || 'Guru') as PersonRole;
    const unit = clampStr(body.unit, 60);
    const activity = clampStr(body.activity, 120);
    const workstation = clampStr(body.workstation, 40);
    const notes = clampStr(body.notes, 200);

    if (
      !date ||
      !checkInTime ||
      !visitorName ||
      !unit ||
      !activity ||
      !ALLOWED_PERSON_ROLES.has(visitorRole)
    ) {
      throw new Error('Data absensi belum lengkap.');
    }

    try {
      const ref = await addDoc(collection(db, 'attendances'), {
        userId: uid,
        date,
        checkInTime,
        checkOutTime,
        visitorName,
        visitorRole,
        unit,
        activity,
        workstation,
        notes,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return { id: ref.id } as T;
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'attendances');
    }
  }

  if (path.startsWith('/api/attendances/') && m === 'PUT') {
    const id = path.slice('/api/attendances/'.length);
    const attRef = doc(db, 'attendances', id);
    const existingSnap = await getDoc(attRef);
    if (!existingSnap.exists()) throw new Error('Catatan absensi tidak ditemukan.');
    const existing = existingSnap.data();

    try {
      if (isAdmin) {
        await updateDoc(attRef, {
          checkOutTime:
            body.checkOutTime !== undefined
              ? clampStr(body.checkOutTime, 10)
              : String(existing.checkOutTime ?? ''),
          workstation:
            body.workstation !== undefined
              ? clampStr(body.workstation, 40)
              : String(existing.workstation ?? ''),
          notes: body.notes !== undefined ? clampStr(body.notes, 200) : String(existing.notes ?? ''),
          activity: clampStr(body.activity, 120) || String(existing.activity),
          updatedAt: serverTimestamp(),
        });
      } else {
        if (existing.userId !== uid) {
          throw new Error('Anda tidak memiliki izin mengubah absensi ini.');
        }
        if (existing.checkOutTime) {
          throw new Error('Absensi keluar sudah tercatat.');
        }
        await updateDoc(attRef, {
          checkOutTime: clampStr(body.checkOutTime, 10),
          notes: body.notes !== undefined ? clampStr(body.notes, 200) : String(existing.notes ?? ''),
          updatedAt: serverTimestamp(),
        });
      }
      return { ok: true } as T;
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `attendances/${id}`);
    }
  }

  if (path.startsWith('/api/attendances/') && m === 'DELETE') {
    if (!isAdmin) throw new Error('Hanya Administrator Lab yang dapat menghapus absensi.');
    const id = path.slice('/api/attendances/'.length);
    try {
      await deleteDoc(doc(db, 'attendances', id));
      return { ok: true } as T;
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `attendances/${id}`);
    }
  }

  // --- USERS & INVITES ---
  if (path === '/api/users' && m === 'POST') {
    if (!isAdmin) throw new Error('Hanya Administrator Lab yang dapat menambah pengguna.');
    const email = clampStr(body.email, 120).toLowerCase();
    const displayName = clampStr(body.displayName, 80);
    const username = sanitizeUsername(body.username || (email ? email.split('@')[0] : ''));
    const password = typeof body.password === 'string' ? body.password : '';
    const targetRole = String(body.role || 'guru') as SystemRole;
    const unit = clampStr(body.unit, 60);
    const idNumber = clampStr(body.idNumber, 40);
    const phone = clampStr(body.phone, 30);
    const bio = clampStr(body.bio, 240);
    const active = body.active !== false;

    if (!displayName || !ALLOWED_ROLES.has(targetRole)) {
      throw new Error('Nama lengkap dan peran akses wajib diisi.');
    }

    if (password) {
      if (password.length < 6) {
        throw new Error('Password minimal 6 karakter.');
      }
      if (!username) {
        throw new Error('Username wajib diisi jika akun dibuat dengan password.');
      }
      const envRef = doc(db, 'username_auth', username);
      const existingEnv = await getDoc(envRef);
      if (existingEnv.exists()) {
        throw new Error(`Username "${username}" sudah digunakan.`);
      }

      const authEmail =
        email && email.includes('@') ? email : `${username}@sipalak.smkn1sambeng.local`;

      let newUid = '';
      const secondaryAuth = getSecondaryAuth();
      try {
        const cred = await createUserWithEmailAndPassword(secondaryAuth, authEmail, password);
        newUid = cred.user.uid;
      } catch (err) {
        const code = (err as { code?: string })?.code;
        if (code === 'auth/operation-not-allowed') {
          throw new Error(
            'Metode Email/Password belum diaktifkan di Firebase Console (Authentication → Sign-in method → Email/Password).'
          );
        }
        if (code === 'auth/email-already-in-use') {
          throw new Error('Email atau username tersebut sudah terdaftar pada autentikasi.');
        }
        if (code === 'auth/weak-password') {
          throw new Error('Password minimal 6 karakter.');
        }
        throw err;
      } finally {
        await signOut(secondaryAuth).catch(() => {});
      }

      try {
        await setDoc(doc(db, 'users', newUid), {
          uid: newUid,
          displayName,
          username,
          role: targetRole,
          unit,
          idNumber,
          bio,
          active,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `users/${newUid}`);
      }

      try {
        await setDoc(doc(db, 'users', newUid, 'private', 'info'), {
          uid: newUid,
          email: email || authEmail,
          phone,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `users/${newUid}/private/info`);
      }

      if (targetRole === 'admin') {
        try {
          await setDoc(doc(db, 'admins', newUid), {
            uid: newUid,
            grantedBy: uid,
            createdAt: serverTimestamp(),
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.CREATE, `admins/${newUid}`);
        }
      }

      try {
        await upsertUsernameEnvelope(newUid, username, password, authEmail);
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `username_auth/${username}`);
      }

      return { id: newUid, createdDirect: true } as T;
    }

    if (!email || !email.includes('@')) {
      throw new Error('Isi Password (min. 6 karakter) atau Email Google yang valid.');
    }

    try {
      const existingInvites = await getDocs(
        query(collection(db, 'user_invites'), where('email', '==', email))
      );
      if (existingInvites.docs.some((d) => d.data().claimed === false)) {
        throw new Error('Email tersebut sudah terdaftar dalam undangan akun aktif.');
      }

      const ref = await addDoc(collection(db, 'user_invites'), {
        email,
        displayName,
        username,
        role: targetRole,
        unit,
        idNumber,
        phone,
        bio,
        active,
        claimed: false,
        claimedByUid: '',
        invitedBy: uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return { id: ref.id, createdDirect: false } as T;
    } catch (err) {
      if (err instanceof Error && err.message.includes('sudah terdaftar')) throw err;
      handleFirestoreError(err, OperationType.CREATE, 'user_invites');
    }
  }

  if (path.startsWith('/api/users/') && m === 'PUT') {
    if (!isAdmin) throw new Error('Hanya Administrator Lab yang dapat mengubah pengguna.');
    const targetUid = path.slice('/api/users/'.length);
    const userRef = doc(db, 'users', targetUid);
    const existingSnap = await getDoc(userRef);
    if (!existingSnap.exists()) throw new Error('Pengguna tidak ditemukan.');
    const existing = existingSnap.data();

    const displayName = clampStr(body.displayName, 80) || String(existing.displayName);
    const username =
      body.username !== undefined
        ? sanitizeUsername(body.username)
        : String(existing.username ?? '');
    const targetRole = String(body.role || existing.role) as SystemRole;
    const unit = body.unit !== undefined ? clampStr(body.unit, 60) : String(existing.unit ?? '');
    const idNumber =
      body.idNumber !== undefined ? clampStr(body.idNumber, 40) : String(existing.idNumber ?? '');
    const bio = body.bio !== undefined ? clampStr(body.bio, 240) : String(existing.bio ?? '');
    const active = body.active !== undefined ? Boolean(body.active) : existing.active !== false;
    const newPassword = typeof body.password === 'string' ? body.password : '';

    if (!ALLOWED_ROLES.has(targetRole)) throw new Error('Peran tidak valid.');
    if (targetUid === uid && (!active || targetRole !== 'admin')) {
      throw new Error('Anda tidak dapat menonaktifkan atau menurunkan peran akun sendiri.');
    }
    if (newPassword && targetUid !== uid) {
      throw new Error(
        'Password akun lain hanya dapat diatur saat pembuatan akun atau diubah oleh pemiliknya di Profil Saya.'
      );
    }

    try {
      await updateDoc(userRef, {
        displayName,
        username,
        role: targetRole,
        unit,
        idNumber,
        bio,
        active,
        updatedAt: serverTimestamp(),
      });

      const adminDocRef = doc(db, 'admins', targetUid);
      if (targetRole === 'admin') {
        const adminSnap = await getDoc(adminDocRef);
        if (!adminSnap.exists()) {
          await setDoc(adminDocRef, {
            uid: targetUid,
            grantedBy: uid,
            createdAt: serverTimestamp(),
          });
        }
      } else if (targetUid !== uid) {
        await deleteDoc(adminDocRef).catch(() => {
          // Ignore if not present
        });
      }

      if (newPassword && targetUid === uid) {
        if (newPassword.length < 6) {
          throw new Error('Password baru minimal 6 karakter.');
        }
        const authEmail = (user.email || '').trim().toLowerCase();
        if (!authEmail) {
          throw new Error('Email akun tidak ditemukan.');
        }
        const hasPasswordProvider = user.providerData.some((p) => p.providerId === 'password');
        if (hasPasswordProvider) {
          await updatePassword(user, newPassword);
        } else {
          await linkWithCredential(user, EmailAuthProvider.credential(authEmail, newPassword));
        }
        const activeUsername = sanitizeUsername(
          username || String(existing.username ?? '') || authEmail.split('@')[0]
        );
        if (activeUsername) {
          await upsertUsernameEnvelope(uid, activeUsername, newPassword, authEmail);
        }
      }

      return { ok: true } as T;
    } catch (err) {
      if (err instanceof Error && !err.message.startsWith('{')) throw err;
      handleFirestoreError(err, OperationType.UPDATE, `users/${targetUid}`);
    }
  }

  if (path.startsWith('/api/users/') && m === 'DELETE') {
    if (!isAdmin) throw new Error('Hanya Administrator Lab yang dapat menghapus pengguna.');
    const targetUid = path.slice('/api/users/'.length);
    if (targetUid === uid) throw new Error('Tidak dapat menghapus akun sendiri.');
    try {
      const targetUserSnap = await getDoc(doc(db, 'users', targetUid));
      const targetUsername = targetUserSnap.exists()
        ? sanitizeUsername(targetUserSnap.data().username)
        : '';
      if (targetUsername) {
        const envSnap = await getDoc(doc(db, 'username_auth', targetUsername));
        if (envSnap.exists() && envSnap.data().uid === targetUid) {
          await deleteDoc(doc(db, 'username_auth', targetUsername)).catch(() => {});
        }
      }
      await deleteDoc(doc(db, 'users', targetUid, 'private', 'info')).catch(() => {});
      await deleteDoc(doc(db, 'admins', targetUid)).catch(() => {});
      await deleteDoc(doc(db, 'users', targetUid));
      return { ok: true } as T;
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `users/${targetUid}`);
    }
  }

  if (path.startsWith('/api/invites/') && m === 'PUT') {
    if (!isAdmin) throw new Error('Hanya Administrator Lab yang dapat mengubah undangan.');
    const inviteId = path.slice('/api/invites/'.length);
    const invRef = doc(db, 'user_invites', inviteId);
    const snap = await getDoc(invRef);
    if (!snap.exists()) throw new Error('Undangan tidak ditemukan.');
    const existing = snap.data();

    const targetRole = String(body.role || existing.role) as SystemRole;
    if (!ALLOWED_ROLES.has(targetRole)) throw new Error('Peran tidak valid.');

    try {
      await updateDoc(invRef, {
        displayName: clampStr(body.displayName, 80) || String(existing.displayName),
        username:
          body.username !== undefined
            ? sanitizeUsername(body.username)
            : String(existing.username ?? ''),
        role: targetRole,
        unit: body.unit !== undefined ? clampStr(body.unit, 60) : String(existing.unit ?? ''),
        idNumber:
          body.idNumber !== undefined ? clampStr(body.idNumber, 40) : String(existing.idNumber ?? ''),
        phone: body.phone !== undefined ? clampStr(body.phone, 30) : String(existing.phone ?? ''),
        bio: body.bio !== undefined ? clampStr(body.bio, 240) : String(existing.bio ?? ''),
        active: body.active !== undefined ? Boolean(body.active) : existing.active !== false,
        updatedAt: serverTimestamp(),
      });
      return { ok: true } as T;
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `user_invites/${inviteId}`);
    }
  }

  if (path.startsWith('/api/invites/') && m === 'DELETE') {
    if (!isAdmin) throw new Error('Hanya Administrator Lab yang dapat menghapus undangan.');
    const inviteId = path.slice('/api/invites/'.length);
    try {
      await deleteDoc(doc(db, 'user_invites', inviteId));
      return { ok: true } as T;
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `user_invites/${inviteId}`);
    }
  }

  throw new Error(`Operasi tidak dikenali: ${m} ${path}`);
}
