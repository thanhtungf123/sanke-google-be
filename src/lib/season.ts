import type { Types } from 'mongoose';
import { connectDB } from '../db/connect.js';
import { Score } from '../db/models/Score.js';
import { Season } from '../db/models/Season.js';
import { LeaderboardSnapshot } from '../db/models/LeaderboardSnapshot.js';
import { notifyMany } from './notifications.js';
import { writeAudit } from './admin.js';
import { getBannedUserIds } from './player.js';
import { monthRangeICT, monthKeyICT, isValidMonthKey } from './time.js';

export const SNAPSHOT_SIZE = 100; // số hạng lưu khi đóng băng

export function defaultRewardTiers(): number {
  const n = Number(process.env.REWARD_TIERS);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 3;
}

export interface BoardEntry {
  rank: number;
  userId: string;
  nickname: string;
  best: number;
  avatarUrl: string | null;
}

// Tính bảng xếp hạng tháng (sống) từ điểm hợp lệ, KHÔNG tính khách.
// Hoà điểm: ai đạt điểm đó TRƯỚC thì hạng trên (sort theo thời điểm đạt best).
async function computeMonthlyBoard(
  monthKey: string,
  limit: number,
  skip = 0
): Promise<BoardEntry[]> {
  const { start, end } = monthRangeICT(monthKey);
  const banned = await getBannedUserIds();
  const rows = await Score.aggregate([
    {
      $match: {
        status: 'valid',
        isGuest: { $ne: true },
        userId: { $nin: banned },
        createdAt: { $gte: start, $lt: end },
      },
    },
    { $sort: { score: -1, createdAt: 1 } },
    {
      $group: {
        _id: '$userId',
        best: { $first: '$score' },
        bestAt: { $first: '$createdAt' },
        nickname: { $first: '$nickname' },
      },
    },
    { $sort: { best: -1, bestAt: 1 } },
    { $skip: skip },
    { $limit: limit },
    { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'u' } },
    {
      $addFields: {
        nickname: { $ifNull: [{ $arrayElemAt: ['$u.nickname', 0] }, '$nickname'] },
        avatarUrl: { $ifNull: [{ $arrayElemAt: ['$u.avatarUrl', 0] }, null] },
      },
    },
    { $project: { u: 0 } },
  ]);

  return rows.map((r, i) => ({
    rank: skip + i + 1,
    userId: String(r._id),
    nickname: r.nickname,
    best: r.best,
    avatarUrl: r.avatarUrl ?? null,
  }));
}

export async function countMonthlyPlayers(monthKey: string): Promise<number> {
  const { start, end } = monthRangeICT(monthKey);
  const banned = await getBannedUserIds();
  const ids = await Score.distinct('userId', {
    status: 'valid',
    isGuest: { $ne: true },
    userId: { $nin: banned },
    createdAt: { $gte: start, $lt: end },
  });
  return ids.length;
}

// Loại các mục có userId bị khoá khỏi snapshot đã đóng băng rồi đánh số hạng lại.
function dropBannedAndRerank(entries: BoardEntry[], banned: Set<string>): BoardEntry[] {
  return entries
    .filter((e) => !banned.has(String(e.userId)))
    .map((e, i) => ({ ...e, rank: i + 1 }));
}

// Số điểm 'flagged' (nghi ngờ) chưa duyệt trong tháng — phải xử lý trước khi chốt.
export async function countPendingFlagged(monthKey: string): Promise<number> {
  const { start, end } = monthRangeICT(monthKey);
  return Score.countDocuments({ status: 'flagged', createdAt: { $gte: start, $lt: end } });
}

export interface SeasonBoard {
  monthKey: string;
  status: 'open' | 'closed';
  frozen: boolean;
  rewardTiers: number;
  total: number;
  rows: BoardEntry[];
  closedAt: Date | null;
}

// Bảng xếp hạng của một tháng: lấy snapshot nếu đã chốt, nếu không thì tính sống.
export async function getSeasonBoard(
  monthKey: string,
  limit: number,
  skip: number
): Promise<SeasonBoard> {
  await connectDB();
  const snap = await LeaderboardSnapshot.findOne({ monthKey }).lean();
  if (snap) {
    const banned = new Set((await getBannedUserIds()).map(String));
    const all = dropBannedAndRerank(
      (snap.entries ?? []).map((e) => ({
        rank: e.rank,
        userId: String(e.userId),
        nickname: e.nickname,
        best: e.best,
        avatarUrl: e.avatarUrl ?? null,
      })),
      banned
    );
    return {
      monthKey,
      status: 'closed',
      frozen: true,
      rewardTiers: snap.rewardTiers ?? defaultRewardTiers(),
      total: all.length,
      rows: all.slice(skip, skip + limit),
      closedAt: null,
    };
  }

  const rows = await computeMonthlyBoard(monthKey, limit, skip);
  const total = await countMonthlyPlayers(monthKey);
  return {
    monthKey,
    status: 'open',
    frozen: false,
    rewardTiers: defaultRewardTiers(),
    total,
    rows,
    closedAt: null,
  };
}

// Hạng của một người chơi trong tháng (snapshot nếu đã chốt; nếu không thì tính sống).
export async function getUserSeasonRank(
  monthKey: string,
  userId: string
): Promise<{ rank: number; best: number } | null> {
  await connectDB();
  const banned = new Set((await getBannedUserIds()).map(String));
  if (banned.has(String(userId))) return null; // người bị khoá không có hạng

  const snap = await LeaderboardSnapshot.findOne({ monthKey }).lean();
  if (snap) {
    const all = dropBannedAndRerank(
      (snap.entries ?? []).map((e) => ({
        rank: e.rank,
        userId: String(e.userId),
        nickname: e.nickname,
        best: e.best,
        avatarUrl: e.avatarUrl ?? null,
      })),
      banned
    );
    const e = all.find((x) => String(x.userId) === String(userId));
    return e ? { rank: e.rank, best: e.best } : null;
  }

  const { start, end } = monthRangeICT(monthKey);
  const mine = await Score.find({ status: 'valid', userId, createdAt: { $gte: start, $lt: end } })
    .sort({ score: -1, createdAt: 1 })
    .limit(1)
    .lean();
  if (!mine.length) return null;
  const myBest = mine[0].score;
  const myBestAt = (mine[0] as { createdAt?: Date }).createdAt ?? new Date();

  // Số người chơi "đứng trên": best cao hơn, hoặc bằng điểm nhưng đạt sớm hơn.
  const bannedIds = await getBannedUserIds();
  const agg = await Score.aggregate([
    {
      $match: {
        status: 'valid',
        isGuest: { $ne: true },
        userId: { $nin: bannedIds },
        createdAt: { $gte: start, $lt: end },
      },
    },
    { $sort: { score: -1, createdAt: 1 } },
    { $group: { _id: '$userId', best: { $first: '$score' }, bestAt: { $first: '$createdAt' } } },
    {
      $match: {
        $expr: {
          $or: [
            { $gt: ['$best', myBest] },
            { $and: [{ $eq: ['$best', myBest] }, { $lt: ['$bestAt', myBestAt] }] },
          ],
        },
      },
    },
    { $count: 'ahead' },
  ]);
  const ahead = agg[0]?.ahead ?? 0;
  return { rank: ahead + 1, best: myBest };
}

export interface CloseResult {
  monthKey: string;
  rewardTiers: number;
  winners: BoardEntry[];
  totalPlayers: number;
}

// CHỐT mùa giải: đóng băng snapshot top-N, bắn thông báo cho top rewardTiers, ghi audit.
// Ném Error với .status (http code) để route trả đúng mã.
export async function closeSeason(
  monthKey: string,
  adminId: Types.ObjectId | string,
  rewardTiers: number,
  force: boolean
): Promise<CloseResult> {
  await connectDB();
  if (!isValidMonthKey(monthKey)) throw httpError(400, 'Key tháng không hợp lệ');

  const current = monthKeyICT();
  if (monthKey > current) throw httpError(400, 'Tháng chưa diễn ra');
  if (monthKey === current && !force)
    throw httpError(400, 'Tháng hiện tại chưa kết thúc. Dùng force để chốt sớm.');

  const existing = await Season.findOne({ monthKey });
  if (existing && existing.status === 'closed') throw httpError(409, 'Mùa giải đã được chốt');

  const pending = await countPendingFlagged(monthKey);
  if (pending > 0 && !force)
    throw httpError(400, `Còn ${pending} điểm nghi ngờ chưa duyệt trong tháng. Duyệt xong rồi chốt, hoặc dùng force.`);

  const tiers = Number.isFinite(rewardTiers) && rewardTiers > 0 ? Math.floor(rewardTiers) : defaultRewardTiers();

  // Đóng băng top-N.
  const entries = await computeMonthlyBoard(monthKey, SNAPSHOT_SIZE, 0);
  const totalPlayers = await countMonthlyPlayers(monthKey);

  await LeaderboardSnapshot.findOneAndUpdate(
    { monthKey },
    {
      $set: {
        monthKey,
        entries: entries.map((e) => ({
          rank: e.rank,
          userId: e.userId,
          nickname: e.nickname,
          best: e.best,
          avatarUrl: e.avatarUrl,
        })),
        rewardTiers: tiers,
        generatedAt: new Date(),
      },
    },
    { upsert: true, new: true }
  );

  const season = existing ?? new Season({ monthKey });
  season.status = 'closed';
  season.closedAt = new Date();
  season.closedByUserId = adminId as Types.ObjectId;
  season.rewardTiers = tiers;
  season.totalPlayers = totalPlayers;
  await season.save();

  // Thông báo cho top (đã loại khách sẵn trong board).
  const winners = entries.slice(0, tiers);
  await notifyMany(
    winners.map((w) => ({
      userId: w.userId,
      type: 'reward' as const,
      messageKey: 'rewardGranted',
      data: { rank: w.rank, month: monthKey },
    }))
  );

  await writeAudit({
    actorId: adminId,
    action: 'season.close',
    targetType: 'tournament',
    targetId: season._id,
    meta: { monthKey, rewardTiers: tiers, winners: winners.length, totalPlayers, forced: force },
  });

  return { monthKey, rewardTiers: tiers, winners, totalPlayers };
}

// Danh sách mùa giải gần đây (mới → cũ) kèm trạng thái — cho người chơi & admin.
export async function listRecentSeasons(
  monthKeys: string[]
): Promise<Array<{ monthKey: string; status: 'open' | 'closed'; closedAt: Date | null }>> {
  await connectDB();
  const closed = await Season.find({ monthKey: { $in: monthKeys }, status: 'closed' })
    .select('monthKey closedAt')
    .lean();
  const byKey = new Map(closed.map((s) => [s.monthKey, s]));
  const current = monthKeyICT();
  return monthKeys.map((k) => {
    const s = byKey.get(k);
    return {
      monthKey: k,
      status: s ? ('closed' as const) : ('open' as const),
      closedAt: s?.closedAt ?? null,
      isCurrent: k === current,
    } as { monthKey: string; status: 'open' | 'closed'; closedAt: Date | null; isCurrent: boolean };
  });
}

function httpError(status: number, message: string): Error & { status: number } {
  const e = new Error(message) as Error & { status: number };
  e.status = status;
  return e;
}
