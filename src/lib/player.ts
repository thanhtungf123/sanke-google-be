import type { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import type { HydratedDocument, Types } from 'mongoose';
import { connectDB } from '../db/connect.js';
import { User, UserDoc } from '../db/models/User.js';
import { Score } from '../db/models/Score.js';
import { GameSession } from '../db/models/GameSession.js';
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

// Gộp dữ liệu của một guest vào tài khoản đích (khi khách ĐĂNG NHẬP sau lúc chơi).
// Chuyển điểm + phiên chơi sang tài khoản, tính lại kỷ lục/số ván, rồi xoá guest.
// (Đăng ký thì nâng cấp guest tại chỗ nên không cần gọi hàm này.)
export async function mergeGuestInto(guest: UserHydrated, target: UserHydrated): Promise<void> {
  await connectDB();
  await Score.updateMany(
    { userId: guest._id },
    { $set: { userId: target._id, nickname: target.nickname, isGuest: false } }
  );
  await GameSession.updateMany({ userId: guest._id }, { $set: { userId: target._id } });
  // Tính lại thống kê từ điểm hợp lệ (gồm cả điểm vừa chuyển sang).
  const valid = await Score.find({ userId: target._id, status: 'valid' })
    .select('score')
    .lean<{ score: number }[]>();
  target.gamesPlayed = valid.length;
  target.personalBest = valid.reduce((m, s) => Math.max(m, s.score ?? 0), 0);
  await target.save();
  await User.deleteOne({ _id: guest._id });
}

// Danh sách _id của các tài khoản bị khoá — để loại khỏi bảng xếp hạng / top.
export async function getBannedUserIds(): Promise<Types.ObjectId[]> {
  await connectDB();
  return User.find({ status: 'banned' }).distinct('_id') as unknown as Promise<Types.ObjectId[]>;
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
