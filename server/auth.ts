import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { db, type DbUserRow } from './db.ts';

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;

export interface AuthenticatedRequest extends Request {
  authUser?: DbUserRow;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, expectedHex] = parts;
  if (!salt || !expectedHex) return false;
  try {
    const derived = crypto.scryptSync(password, salt, 64);
    const expected = Buffer.from(expectedHex, 'hex');
    if (derived.length !== expected.length) return false;
    return crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

function hashToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

export function createSession(uid: string): string {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);
  const now = Date.now();
  const expiresAt = now + SESSION_TTL_MS;

  db.prepare(
    'INSERT INTO sessions (token_hash, uid, created_at, expires_at) VALUES (?, ?, ?, ?)'
  ).run(tokenHash, uid, now, expiresAt);

  return rawToken;
}

export function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  return token || null;
}

export function resolveSessionUser(rawToken: string): DbUserRow | null {
  const tokenHash = hashToken(rawToken);
  const now = Date.now();
  const row = db
    .prepare(
      `SELECT u.*
       FROM sessions s
       JOIN users u ON u.uid = s.uid
       WHERE s.token_hash = ? AND s.expires_at > ?
       LIMIT 1`
    )
    .get(tokenHash, now) as unknown as DbUserRow | undefined;

  if (!row || row.active !== 1) return null;
  return row;
}

export function revokeSessionByToken(rawToken: string): void {
  const tokenHash = hashToken(rawToken);
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
}

export function revokeUserSessions(uid: string): void {
  db.prepare('DELETE FROM sessions WHERE uid = ?').run(uid);
}

export function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const token = extractBearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'Sesi tidak ditemukan. Silakan masuk terlebih dahulu.' });
    return;
  }

  const user = resolveSessionUser(token);
  if (!user) {
    res.status(401).json({ error: 'Sesi tidak valid atau telah berakhir. Silakan masuk ulang.' });
    return;
  }

  req.authUser = user;
  next();
}

export function requireAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  if (!req.authUser || req.authUser.role !== 'admin') {
    res.status(403).json({ error: 'Akses ditolak. Fitur ini khusus Administrator Lab.' });
    return;
  }
  next();
}
