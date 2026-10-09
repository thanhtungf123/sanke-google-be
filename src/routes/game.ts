import { Router } from 'express';
import { connectDB } from '../db/connect.js';
import { GameSession } from '../db/models/GameSession.js';
import { Score } from '../db/models/Score.js';
import { submitScoreSchema } from '../validation/schemas.js';
import { resolvePlayer, getPlayerNoCreate } from '../lib/player.js';
import { rateLimit } from '../lib/rateLimit.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { evaluateAchievements, getPlayerTotals } from '../lib/achievements.js';
import { updateChallengeProgress } from '../lib/challenges.js';
import { evaluateScore, hashIp } from '../lib/antiCheat.js';

export const gameRouter = Router();

const SESSION_TTL_MS = 2 * 60 * 60 * 1000;
const MINUTE = 60 * 1000;

gameRouter.post(
  '/start',
  asyncHandler(async (req, res) => {
    await connectDB();
    const player = await resolvePlayer(req, res);

    // Rate limit theo tài khoản VÀ theo IP (chặn farm nhiều guest cùng nguồn).
    const rl = await rateLimit(`start:${player._id}`, 120, MINUTE);
    if (!rl.allowed) return res.status(429).json({ error: 'Quá nhiều ván, chậm lại chút nhé.' });
    const rlIp = await rateLimit(`start:ip:${hashIp(req)}`, 240, MINUTE);
    if (!rlIp.allowed) return res.status(429).json({ error: 'Quá nhiều ván từ mạng này.' });

    const now = new Date();

    // Một phiên chơi active mỗi người: vô hiệu các phiên cũ CHƯA nộp để không "tích trữ".
    await GameSession.updateMany(
      { userId: player._id, submitted: false, expiresAt: { $gt: now } },
      { $set: { expiresAt: now } }
    );

    const session = await GameSession.create({
      userId: player._id,
      seed: 0,
      startedAt: now,
      expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
    });
    res.json({ sessionId: String(session._id) });
  })
);

gameRouter.post(
  '/submit',
  asyncHandler(async (req, res) => {
    const parsed = submitScoreSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Dữ liệu không hợp lệ' });

    const { sessionId, score } = parsed.data;
    await connectDB();

    const player = await getPlayerNoCreate(req);
    if (!player) return res.status(401).json({ error: 'Không xác định được người chơi' });

    const ipHash = hashIp(req);
    const rl = await rateLimit(`submit:${player._id}`, 30, MINUTE);
    if (!rl.allowed) return res.status(429).json({ error: 'Gửi điểm quá nhanh.' });
    const rlIp = await rateLimit(`submit:ip:${ipHash}`, 60, MINUTE);
    if (!rlIp.allowed) return res.status(429).json({ error: 'Gửi điểm quá nhanh từ mạng này.' });

    const session = await GameSession.findById(sessionId);
    if (
      !session ||
      String(session.userId) !== String(player._id) ||
      session.submitted ||
      session.expiresAt.getTime() < Date.now()
    ) {
      return res.status(400).json({ error: 'Phiên chơi không hợp lệ' });
    }

    const endedAt = new Date();
    const durationMs = endedAt.getTime() - session.startedAt.getTime();

    // Đánh dấu đã nộp TRƯỚC khi xét (tránh nộp lại cùng phiên khi xét chạy lâu).
    session.submitted = true;
    await session.save();

    // Anti-cheat: REJECT điểm bất khả thi, FLAG các dấu hiệu nghi ngờ (admin duyệt trước khi thưởng).
    const verdict = await evaluateScore({
      score,
      durationMs,
      userId: player._id,
      isGuest: player.isGuest,
      priorPersonalBest: player.personalBest ?? 0,
      gamesPlayed: player.gamesPlayed ?? 0,
    });
    const status = verdict.status;

    await Score.create({
      userId: player._id,
      nickname: player.nickname,
      isGuest: player.isGuest,
      score,
      startedAt: session.startedAt,
      endedAt,
      durationMs,
      source: 'google',
      gameVersion: 'current',
      status,
      rejectedReason: verdict.reason,
      flags: verdict.flags,
      clientMeta: { ua: req.headers['user-agent'], ipHash },
    });

    let unlockedAchievements: string[] = [];
    let completedChallenges: string[] = [];
    if (status === 'valid') {
      player.gamesPlayed = (player.gamesPlayed ?? 0) + 1;
      if (score > (player.personalBest ?? 0)) player.personalBest = score;
      await player.save();

      // Xét thành tích + thử thách (không chặn phản hồi nếu lỗi phụ).
      try {
        const totals = await getPlayerTotals(player._id);
        unlockedAchievements = await evaluateAchievements(
          player._id,
          {
            score,
            durationMs,
            gamesPlayed: player.gamesPlayed ?? 0,
            personalBest: player.personalBest ?? 0,
            totalScore: totals.totalScore,
            longestGameMs: totals.longestGameMs,
          },
          !player.isGuest
        );
      } catch (e) {
        console.error('[achievements]', e);
      }
      try {
        completedChallenges = await updateChallengeProgress(
          player._id,
          { score },
          !player.isGuest
        );
      } catch (e) {
        console.error('[challenges]', e);
      }
    }

    res.json({
      ok: true,
      status,
      score,
      flags: verdict.flags,
      personalBest: player.personalBest ?? 0,
      unlockedAchievements,
      completedChallenges,
    });
  })
);
