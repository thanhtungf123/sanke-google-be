import { createHash } from 'crypto';
import type { Request } from 'express';
import type { Types } from 'mongoose';
import { connectDB } from '../db/connect.js';
import { Score } from '../db/models/Score.js';
import { getClientIp } from './rateLimit.js';

// ---------------------------------------------------------------------------
// Anti-cheat (L2) — luật hợp lý hoá điểm. Vì game là HỘP ĐEN (không replay được),
// ta không chứng minh điểm đúng; ta chỉ:
//   - REJECT thẳng điểm bất khả thi (vượt trần vật lý của bàn chơi).
//   - FLAG các dấu hiệu nghi ngờ để admin duyệt TRƯỚC khi chốt thưởng.
// Mọi ngưỡng đều cấu hình qua env để siết dần mà không phải sửa code.
// ---------------------------------------------------------------------------

function envNum(name: string, def: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : def;
}

export const ANTICHEAT = {
  // Trần điểm bất khả thi → auto REJECT. Bàn Google Snake mặc định không thể đạt ngần này.
  maxScore: () => envNum('ANTICHEAT_MAX_SCORE', 1000),
  // Thời gian tối thiểu cho mỗi điểm (ms) — nhanh hơn => nghi ngờ.
  minMsPerPoint: () => envNum('ANTICHEAT_MIN_MS_PER_POINT', 250),
  // Ván có điểm > 0 phải kéo dài tối thiểu bấy nhiêu ms.
  minDurationMs: () => envNum('ANTICHEAT_MIN_DURATION_MS', 1000),
  // pb_spike: điểm mới > factor × kỷ lục cũ (chỉ xét người có lịch sử đủ nhiều).
  pbSpikeFactor: () => envNum('ANTICHEAT_PB_SPIKE_FACTOR', 2.5),
  pbSpikeMinGames: () => envNum('ANTICHEAT_PB_SPIKE_MIN_GAMES', 5),
  pbSpikeMinScore: () => envNum('ANTICHEAT_PB_SPIKE_MIN_SCORE', 30),
  // global_outlier: điểm mới > factor × điểm valid cao nhất của NGƯỜI KHÁC,
  // chỉ khi baseline đã đủ lớn (tránh flag oan lúc BXH còn trống).
  outlierFactor: () => envNum('ANTICHEAT_OUTLIER_FACTOR', 2),
  outlierMinBaseline: () => envNum('ANTICHEAT_OUTLIER_MIN_BASELINE', 20),
};

export type ScoreFlag =
  | 'impossible'
  | 'too_fast'
  | 'too_short'
  | 'pb_spike'
  | 'global_outlier';

export interface EvalContext {
  score: number;
  durationMs: number;
  userId: Types.ObjectId | string;
  isGuest: boolean;
  priorPersonalBest: number; // kỷ lục cũ (trước ván này)
  gamesPlayed: number; // số ván trước ván này
}

export interface EvalResult {
  status: 'valid' | 'flagged' | 'rejected';
  flags: ScoreFlag[];
  reason?: string; // lý do chính (hiển thị cho admin / client)
}

// Điểm valid cao nhất của NGƯỜI KHÁC (không tính khách) — baseline phát hiện outlier.
async function highestValidScoreExcluding(userId: Types.ObjectId | string): Promise<number> {
  await connectDB();
  const top = await Score.findOne({
    status: 'valid',
    isGuest: { $ne: true },
    userId: { $ne: userId },
  })
    .sort({ score: -1 })
    .select('score')
    .lean();
  return top?.score ?? 0;
}

// Đánh giá một lần nộp điểm. Trả status + danh sách cờ + lý do chính.
export async function evaluateScore(ctx: EvalContext): Promise<EvalResult> {
  const flags: ScoreFlag[] = [];
  const { score, durationMs } = ctx;

  // 1) Bất khả thi → REJECT ngay, khỏi cần xét tiếp.
  if (score > ANTICHEAT.maxScore()) {
    return {
      status: 'rejected',
      flags: ['impossible'],
      reason: `Điểm vượt trần hợp lệ (${ANTICHEAT.maxScore()})`,
    };
  }

  // 2) Các dấu hiệu nghi ngờ → FLAG để admin duyệt.
  if (score > 0 && durationMs < score * ANTICHEAT.minMsPerPoint()) {
    flags.push('too_fast');
  }
  if (score > 0 && durationMs < ANTICHEAT.minDurationMs()) {
    flags.push('too_short');
  }

  // pb_spike: nhảy vọt so với lịch sử của chính người chơi (chỉ user có lịch sử đủ nhiều).
  if (
    !ctx.isGuest &&
    ctx.gamesPlayed >= ANTICHEAT.pbSpikeMinGames() &&
    score >= ANTICHEAT.pbSpikeMinScore() &&
    ctx.priorPersonalBest > 0 &&
    score > ctx.priorPersonalBest * ANTICHEAT.pbSpikeFactor()
  ) {
    flags.push('pb_spike');
  }

  // global_outlier: vượt xa điểm cao nhất của người khác (khi baseline đã đủ lớn).
  if (!ctx.isGuest && score >= ANTICHEAT.outlierMinBaseline()) {
    const baseline = await highestValidScoreExcluding(ctx.userId);
    if (baseline >= ANTICHEAT.outlierMinBaseline() && score > baseline * ANTICHEAT.outlierFactor()) {
      flags.push('global_outlier');
    }
  }

  if (flags.length > 0) {
    return { status: 'flagged', flags, reason: reasonForFlags(flags) };
  }
  return { status: 'valid', flags: [] };
}

const FLAG_REASON: Record<ScoreFlag, string> = {
  impossible: 'Điểm bất khả thi',
  too_fast: 'Điểm quá cao so với thời lượng',
  too_short: 'Thời lượng quá ngắn',
  pb_spike: 'Tăng đột biến so với lịch sử người chơi',
  global_outlier: 'Vượt xa mặt bằng bảng xếp hạng',
};

export function reasonForFlags(flags: ScoreFlag[]): string {
  return flags.map((f) => FLAG_REASON[f]).join('; ');
}

// Băm IP (không lưu IP thô) để admin nhận diện farm nhiều tài khoản cùng nguồn.
const IP_SALT = process.env.IP_HASH_SALT || process.env.AUTH_SECRET || 'gs-ip-salt';
export function hashIp(req: Request): string {
  const ip = getClientIp(req);
  return createHash('sha256').update(`${IP_SALT}:${ip}`).digest('hex').slice(0, 16);
}
