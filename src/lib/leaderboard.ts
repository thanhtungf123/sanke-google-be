import { connectDB } from '../db/connect.js';
import { Score } from '../db/models/Score.js';
import { startOfDayICT, startOfWeekICT, startOfMonthICT } from './time.js';
import { getBannedUserIds } from './player.js';

export type Period = 'day' | 'week' | 'month' | 'all';
export const PERIODS: Period[] = ['day', 'week', 'month', 'all'];

// Mốc theo giờ Asia/Ho_Chi_Minh. 'month' = THÁNG DƯƠNG LỊCH (V3), không còn rolling-30-ngày.
function sinceDate(p: Period): Date | null {
  switch (p) {
    case 'day':
      return startOfDayICT();
    case 'week':
      return startOfWeekICT();
    case 'month':
      return startOfMonthICT();
    default:
      return null;
  }
}

export interface LeaderboardRow {
  rank: number;
  userId: string;
  nickname: string;
  best: number;
}

export async function getLeaderboard(
  period: Period,
  limit = 20,
  skip = 0
): Promise<LeaderboardRow[]> {
  await connectDB();
  const since = sinceDate(period);
  const banned = await getBannedUserIds();
  const match: Record<string, unknown> = { status: 'valid', userId: { $nin: banned } };
  if (since) match.createdAt = { $gte: since };

  const rows = await Score.aggregate([
    { $match: match },
    { $sort: { score: -1, createdAt: 1 } },
    { $group: { _id: '$userId', best: { $first: '$score' }, nickname: { $first: '$nickname' } } },
    { $sort: { best: -1 } },
    { $skip: skip },
    { $limit: limit },
    { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'u' } },
    { $addFields: { nickname: { $ifNull: [{ $arrayElemAt: ['$u.nickname', 0] }, '$nickname'] } } },
    { $project: { u: 0 } },
  ]);

  return rows.map((r, i) => ({
    rank: skip + i + 1,
    userId: String(r._id),
    nickname: r.nickname,
    best: r.best,
  }));
}

// Hạng của một người chơi trong kỳ (theo điểm cao nhất của họ trong kỳ).
// Trả null nếu người đó chưa có điểm hợp lệ nào trong kỳ.
export async function getUserRank(
  period: Period,
  userId: string
): Promise<{ rank: number; best: number } | null> {
  await connectDB();
  const since = sinceDate(period);
  const mineMatch: Record<string, unknown> = { status: 'valid', userId };
  if (since) mineMatch.createdAt = { $gte: since };

  const mine = await Score.find(mineMatch).sort({ score: -1 }).limit(1).lean();
  if (!mine.length) return null;
  const best = mine[0].score;

  const banned = await getBannedUserIds();
  const higherMatch: Record<string, unknown> = {
    status: 'valid',
    score: { $gt: best },
    userId: { $nin: banned },
  };
  if (since) higherMatch.createdAt = { $gte: since };
  // Số người chơi khác có điểm cao hơn (distinct userId). Hạng = số đó + 1.
  const higher = await Score.distinct('userId', higherMatch);
  return { rank: higher.length + 1, best };
}
