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
  // Khi web (frontend) và api (backend) ở khác site — vd demo Vercel + Railway —
  // trình duyệt chỉ gửi/nhận cookie nếu SameSite=None; Secure.
  // Đặt COOKIE_SAMESITE=none cho trường hợp đó (bắt buộc kèm HTTPS).
  const sameSite = (process.env.COOKIE_SAMESITE as 'lax' | 'strict' | 'none') || 'lax';
  const secure = sameSite === 'none' ? true : process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    sameSite,
    secure,
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
  const sameSite = (process.env.COOKIE_SAMESITE as 'lax' | 'strict' | 'none') || 'lax';
  res.clearCookie(SESSION_COOKIE, {
    path: '/',
    domain: process.env.COOKIE_DOMAIN || undefined,
    sameSite,
    secure: sameSite === 'none' ? true : process.env.NODE_ENV === 'production',
  });
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

export function clearGuestCookie(res: Response): void {
  const sameSite = (process.env.COOKIE_SAMESITE as 'lax' | 'strict' | 'none') || 'lax';
  res.clearCookie(GUEST_COOKIE, {
    path: '/',
    domain: process.env.COOKIE_DOMAIN || undefined,
    sameSite,
    secure: sameSite === 'none' ? true : process.env.NODE_ENV === 'production',
  });
}
