import { Router } from 'express';
import { connectDB } from '../db/connect.js';
import { GameSession } from '../db/models/GameSession.js';
import { Score } from '../db/models/Score.js';
import { submitScoreSchema } from '../validation/schemas.js';
import { resolvePlayer, getPlayerNoCreate } from '../lib/player.js';
import { rateLimit } from '../lib/rateLimit.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { evaluateAchievements, getPlayerTotals } from '../lib/achievements.js';

export const gameRouter = Router();

const SESSION_TTL_MS = 2 * 60 * 60 * 1000;
const MIN_MS_PER_POINT = 250;

gameRouter.post(
  '/start',
  asyncHandler(async (req, res) => {
    await connectDB();
    const player = await resolvePlayer(req, res);

    const rl = await rateLimit(`start:${player._id}`, 120, 60 * 1000);
    if (!rl.allowed) return res.status(429).json({ error: 'Quá nhiều ván, chậm lại chút nhé.' });

    const now = new Date();
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

    const rl = await rateLimit(`submit:${player._id}`, 30, 60 * 1000);
    if (!rl.allowed) return res.status(429).json({ error: 'Gửi điểm quá nhanh.' });

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

    let status: 'valid' | 'flagged' = 'valid';
    let rejectedReason: string | undefined;
    if (score > 0 && durationMs < score * MIN_MS_PER_POINT) {
      status = 'flagged';
      rejectedReason = 'Điểm quá cao so với thời lượng';
    }
    if (score > 0 && durationMs < 1000) {
      status = 'flagged';
      rejectedReason = 'Thời lượng quá ngắn';
    }

    session.submitted = true;
    await session.save();

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
      rejectedReason,
      clientMeta: { ua: req.headers['user-agent'] },
    });

    let unlockedAchievements: string[] = [];
    if (status === 'valid') {
      player.gamesPlayed = (player.gamesPlayed ?? 0) + 1;
      if (score > (player.personalBest ?? 0)) player.personalBest = score;
      await player.save();

      // Xét thành tích (không chặn phản hồi nếu lỗi phụ).
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
    }

    res.json({
      ok: true,
      status,
      score,
      personalBest: player.personalBest ?? 0,
      unlockedAchievements,
    });
  })
);
