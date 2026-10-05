import type { Request, Response, CookieOptions } from 'express';
import { SignJWT, jwtVerify } from 'jose';

const SESSION_COOKIE = 'gs_session';
export const GUEST_COOKIE = 'gs_guest';
const MAX_AGE = 60 * 60 * 24 * 30; // 30 ngày

function getSecret(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error('AUTH_SECRET chưa được cấu hình');
  return new TextEncoder().encode(s);
}

function cookieOpts(maxAgeSec: number): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: maxAgeSec * 1000,
    domain: process.env.COOKIE_DOMAIN || undefined,
  };
}

export async function createSession(res: Response, userId: string): Promise<void> {
  const token = await new SignJWT({ uid: userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(getSecret());
  res.cookie(SESSION_COOKIE, token, cookieOpts(MAX_AGE));
}

export function destroySession(res: Response): void {
  res.clearCookie(SESSION_COOKIE, { path: '/', domain: process.env.COOKIE_DOMAIN || undefined });
}

export async function getSessionUserId(req: Request): Promise<string | null> {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return (payload.uid as string) ?? null;
  } catch {
    return null;
  }
}

export function getGuestToken(req: Request): string | null {
  return req.cookies?.[GUEST_COOKIE] ?? null;
}

export function setGuestCookie(res: Response, token: string): void {
  res.cookie(GUEST_COOKIE, token, cookieOpts(60 * 60 * 24 * 365));
}
