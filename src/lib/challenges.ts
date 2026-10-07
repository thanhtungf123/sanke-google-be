import type { Types } from 'mongoose';
import { ChallengeProgress } from '../db/models/ChallengeProgress.js';
import { notify } from './notifications.js';
import { dayKeyICT, weekKeyICT } from './time.js';

export type ChallengePeriod = 'daily' | 'weekly';
// games: mỗi ván +1 | points: cộng điểm ván | bestScore: điểm cao nhất 1 ván
export type ChallengeMetric = 'games' | 'points' | 'bestScore';

export interface ChallengeDef {
  code: string;
  period: ChallengePeriod;
  metric: ChallengeMetric;
  target: number;
  order: number;
}

// Danh mục thử thách (tên localize ở frontend: Challenges.defs.<code>.name).
export const CHALLENGES: ChallengeDef[] = [
  { code: 'daily_play_3', period: 'daily', metric: 'games', target: 3, order: 1 },
  { code: 'daily_score_30', period: 'daily', metric: 'bestScore', target: 30, order: 2 },
  { code: 'daily_points_50', period: 'daily', metric: 'points', target: 50, order: 3 },
  { code: 'weekly_play_20', period: 'weekly', metric: 'games', target: 20, order: 4 },
  { code: 'weekly_score_80', period: 'weekly', metric: 'bestScore', target: 80, order: 5 },
  { code: 'weekly_points_300', period: 'weekly', metric: 'points', target: 300, order: 6 },
];

function periodKeyFor(def: ChallengeDef, now: Date): string {
  return def.period === 'daily' ? dayKeyICT(now) : weekKeyICT(now);
}

// Giá trị cộng/so với tiến độ cho 1 ván, theo metric.
function valueFor(metric: ChallengeMetric, score: number): { op: '$inc' | '$max'; value: number } {
  if (metric === 'games') return { op: '$inc', value: 1 };
  if (metric === 'points') return { op: '$inc', value: score };
  return { op: '$max', value: score }; // bestScore
}

// Cập nhật tiến độ thử thách sau một ván hợp lệ. Trả về code các thử thách vừa hoàn thành.
export async function updateChallengeProgress(
  userId: Types.ObjectId | string,
  ctx: { score: number },
  notifyUser: boolean,
  now: Date = new Date()
): Promise<string[]> {
  const completedNow: string[] = [];

  for (const def of CHALLENGES) {
    const periodKey = periodKeyFor(def, now);
    const { op, value } = valueFor(def.metric, ctx.score);

    const doc = await ChallengeProgress.findOneAndUpdate(
      { userId, code: def.code, periodKey },
      {
        $setOnInsert: {
          userId,
          code: def.code,
          periodKey,
          period: def.period,
          target: def.target,
        },
        [op]: { progress: value },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    if (doc && !doc.completed && doc.progress >= doc.target) {
      doc.completed = true;
      doc.completedAt = new Date();
      await doc.save();
      completedNow.push(def.code);
      if (notifyUser) {
        await notify(userId, {
          type: 'challenge',
          messageKey: 'challengeCompleted',
          data: { code: def.code },
        });
      }
    }
  }

  return completedNow;
}

// Lấy tiến độ hiện tại của tất cả thử thách (kỳ hiện tại) cho người chơi.
export async function getChallengeStatus(
  userId: Types.ObjectId | string,
  now: Date = new Date()
) {
  const keys = CHALLENGES.map((def) => periodKeyFor(def, now));
  const rows = await ChallengeProgress.find({
    userId,
    $or: CHALLENGES.map((def, i) => ({ code: def.code, periodKey: keys[i] })),
  }).lean();
  const byCode = new Map(rows.map((r) => [r.code, r]));

  return [...CHALLENGES]
    .sort((a, b) => a.order - b.order)
    .map((def) => {
      const r = byCode.get(def.code);
      return {
        code: def.code,
        period: def.period,
        metric: def.metric,
        target: def.target,
        progress: Math.min(r?.progress ?? 0, def.target),
        completed: r?.completed ?? false,
      };
    });
}
