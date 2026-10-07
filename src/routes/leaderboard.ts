import { Router } from 'express';
import { getLeaderboard, getUserRank, PERIODS, type Period } from '../lib/leaderboard.js';
import { getLoggedInUser } from '../lib/player.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { getSeasonBoard, getUserSeasonRank, listRecentSeasons } from '../lib/season.js';
import { monthKeyICT, recentMonthKeys, isValidMonthKey } from '../lib/time.js';

export const leaderboardRouter = Router();

function resolvePeriod(req: { query: Record<string, unknown> }): Period {
  const p = req.query.period as Period | undefined;
  return p && PERIODS.includes(p) ? p : 'all';
}

function resolveMonth(req: { query: Record<string, unknown> }): string {
  const m = req.query.month;
  return typeof m === 'string' && isValidMonthKey(m) ? m : monthKeyICT();
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

// GET /api/leaderboard/seasons — danh sách tháng gần đây + trạng thái (cho bộ chọn mùa giải).
leaderboardRouter.get(
  '/seasons',
  asyncHandler(async (req, res) => {
    const count = Math.min(Math.max(Number(req.query.count ?? 6) || 6, 1), 24);
    const months = recentMonthKeys(count);
    const seasons = await listRecentSeasons(months);
    res.json({ current: monthKeyICT(), seasons });
  })
);

// GET /api/leaderboard/season?month=YYYY-MM&limit=&skip= — bảng xếp hạng 1 tháng (sống hoặc đã đóng băng).
leaderboardRouter.get(
  '/season',
  asyncHandler(async (req, res) => {
    const month = resolveMonth(req);
    const limit = Math.min(Number(req.query.limit ?? 20) || 20, 100);
    const skip = Math.max(Number(req.query.skip ?? 0) || 0, 0);
    const board = await getSeasonBoard(month, limit, skip);
    res.json(board);
  })
);

// GET /api/leaderboard/season/me?month= — hạng của người đang đăng nhập trong tháng.
leaderboardRouter.get(
  '/season/me',
  asyncHandler(async (req, res) => {
    const user = await getLoggedInUser(req);
    if (!user) return res.json({ rank: null, best: null });
    const month = resolveMonth(req);
    const r = await getUserSeasonRank(month, String(user._id));
    res.json({ rank: r?.rank ?? null, best: r?.best ?? null, nickname: user.nickname, month });
  })
);
