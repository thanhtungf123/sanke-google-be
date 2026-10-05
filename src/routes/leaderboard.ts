import { Router } from 'express';
import { getLeaderboard, getUserRank, PERIODS, type Period } from '../lib/leaderboard.js';
import { getLoggedInUser } from '../lib/player.js';
import { asyncHandler } from '../lib/asyncHandler.js';

export const leaderboardRouter = Router();

function resolvePeriod(req: { query: Record<string, unknown> }): Period {
  const p = req.query.period as Period | undefined;
  return p && PERIODS.includes(p) ? p : 'all';
}

leaderboardRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const period = resolvePeriod(req);
    const limit = Math.min(Number(req.query.limit ?? 20) || 20, 100);
    const skip = Math.max(Number(req.query.skip ?? 0) || 0, 0);
    const rows = await getLeaderboard(period, limit, skip);
    res.json({ period, rows });
  })
);

// GET /api/leaderboard/me?period= — hạng của người đang đăng nhập trong kỳ.
leaderboardRouter.get(
  '/me',
  asyncHandler(async (req, res) => {
    const user = await getLoggedInUser(req);
    if (!user) return res.json({ rank: null, best: null });
    const period = resolvePeriod(req);
    const r = await getUserRank(period, String(user._id));
    res.json({ rank: r?.rank ?? null, best: r?.best ?? null, nickname: user.nickname });
  })
);
