import type { Types } from 'mongoose';
import { Score } from '../db/models/Score.js';
import { UserAchievement } from '../db/models/UserAchievement.js';
import { notify } from './notifications.js';

// Bối cảnh để xét điều kiện mở khóa thành tích.
export interface AchievementContext {
  score: number; // điểm ván vừa chơi
  durationMs: number; // thời lượng ván vừa chơi
  gamesPlayed: number; // tổng số ván hợp lệ (sau khi +1)
  personalBest: number; // điểm cao nhất (sau cập nhật)
  totalScore: number; // tổng điểm hợp lệ tích lũy
  longestGameMs: number; // ván dài nhất (ms)
}

export interface AchievementDef {
  code: string;
  // Thứ tự hiển thị / nhóm (để sắp xếp UI).
  order: number;
  // Điều kiện mở khóa.
  test: (c: AchievementContext) => boolean;
}

// Danh mục thành tích (tên/mô tả localize ở frontend: Achievements.defs.<code>.name/.desc).
export const ACHIEVEMENTS: AchievementDef[] = [
  { code: 'first_game', order: 1, test: (c) => c.gamesPlayed >= 1 },
  { code: 'score_10', order: 2, test: (c) => c.score >= 10 },
  { code: 'score_25', order: 3, test: (c) => c.score >= 25 },
  { code: 'score_50', order: 4, test: (c) => c.score >= 50 },
  { code: 'score_100', order: 5, test: (c) => c.score >= 100 },
  { code: 'games_10', order: 6, test: (c) => c.gamesPlayed >= 10 },
  { code: 'games_50', order: 7, test: (c) => c.gamesPlayed >= 50 },
  { code: 'games_100', order: 8, test: (c) => c.gamesPlayed >= 100 },
  { code: 'total_500', order: 9, test: (c) => c.totalScore >= 500 },
  { code: 'total_2000', order: 10, test: (c) => c.totalScore >= 2000 },
  { code: 'survivor', order: 11, test: (c) => c.longestGameMs >= 2 * 60 * 1000 },
];

export const ACHIEVEMENT_CODES = ACHIEVEMENTS.map((a) => a.code);

// Xét & mở khóa thành tích mới sau một ván hợp lệ.
// - notifyUser=false cho khách (guest không xem được hộp thư) để tránh rác.
// Trả về danh sách code vừa mở khóa (để client hiện toast nếu muốn).
export async function evaluateAchievements(
  userId: Types.ObjectId | string,
  ctx: AchievementContext,
  notifyUser: boolean
): Promise<string[]> {
  const already = new Set(
    (await UserAchievement.find({ userId }).select('code').lean()).map((d) => d.code)
  );

  const newlyUnlocked = ACHIEVEMENTS.filter(
    (a) => !already.has(a.code) && a.test(ctx)
  ).map((a) => a.code);

  if (newlyUnlocked.length === 0) return [];

  // Chèn bản ghi; chống đua bằng unique index (bỏ qua lỗi trùng).
  try {
    await UserAchievement.insertMany(
      newlyUnlocked.map((code) => ({ userId, code })),
      { ordered: false }
    );
  } catch {
    // Trùng do 2 request song song — không sao, bản ghi đã tồn tại.
  }

  if (notifyUser) {
    for (const code of newlyUnlocked) {
      await notify(userId, {
        type: 'achievement',
        messageKey: 'achievementUnlocked',
        data: { code },
      });
    }
  }

  return newlyUnlocked;
}

// Tổng điểm hợp lệ + ván dài nhất (dùng để dựng context khi submit).
export async function getPlayerTotals(
  userId: Types.ObjectId | string
): Promise<{ totalScore: number; longestGameMs: number }> {
  const agg = await Score.aggregate([
    { $match: { userId, status: 'valid' } },
    {
      $group: {
        _id: null,
        totalScore: { $sum: '$score' },
        longestGameMs: { $max: '$durationMs' },
      },
    },
  ]);
  const a = agg[0];
  return {
    totalScore: a?.totalScore ?? 0,
    longestGameMs: a?.longestGameMs ?? 0,
  };
}
