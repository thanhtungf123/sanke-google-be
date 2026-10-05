import type { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import type { HydratedDocument } from 'mongoose';
import { connectDB } from '../db/connect.js';
import { User, UserDoc } from '../db/models/User.js';
import { getSessionUserId, getGuestToken, setGuestCookie } from './session.js';

export type UserHydrated = HydratedDocument<UserDoc>;

export async function getLoggedInUser(req: Request): Promise<UserHydrated | null> {
  const uid = await getSessionUserId(req);
  if (!uid) return null;
  await connectDB();
  const user = await User.findById(uid);
  if (!user || user.status === 'banned') return null;
  return user;
}

function randomNick(): string {
  return 'Guest-' + Math.random().toString(36).slice(2, 8);
}

async function createGuest(token: string): Promise<UserHydrated> {
  await connectDB();
  for (let i = 0; i < 5; i++) {
    const nickname = randomNick();
    try {
      return await User.create({
        isGuest: true,
        guestToken: token,
        nickname,
        nicknameLower: nickname.toLowerCase(),
      });
    } catch (e) {
      const existing = await User.findOne({ guestToken: token });
      if (existing) return existing;
      if (i === 4) throw e;
    }
  }
  throw new Error('Không tạo được guest');
}

// Lấy người chơi, tạo guest nếu cần (và set cookie guest trên res).
export async function resolvePlayer(req: Request, res: Response): Promise<UserHydrated> {
  const loggedIn = await getLoggedInUser(req);
  if (loggedIn) return loggedIn;

  let token = getGuestToken(req);
  if (!token) {
    token = randomUUID();
    setGuestCookie(res, token);
  }
  await connectDB();
  const existing = await User.findOne({ guestToken: token, isGuest: true });
  return existing ?? (await createGuest(token));
}

// Lấy người chơi hiện tại nhưng KHÔNG tạo guest (dùng cho submit).
export async function getPlayerNoCreate(req: Request): Promise<UserHydrated | null> {
  const loggedIn = await getLoggedInUser(req);
  if (loggedIn) return loggedIn;
  const token = getGuestToken(req);
  if (!token) return null;
  await connectDB();
  return User.findOne({ guestToken: token, isGuest: true });
}

export async function getGuestByToken(token: string): Promise<UserHydrated | null> {
  await connectDB();
  return User.findOne({ guestToken: token, isGuest: true });
}

export function publicUser(u: UserHydrated) {
  return {
    id: String(u._id),
    nickname: u.nickname,
    isGuest: u.isGuest,
    role: u.role,
    personalBest: u.personalBest,
    gamesPlayed: u.gamesPlayed,
    avatarUrl: u.avatarUrl ?? null,
  };
}
