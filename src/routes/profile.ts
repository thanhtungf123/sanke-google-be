import { Router } from 'express';
import { connectDB } from '../db/connect.js';
import { User } from '../db/models/User.js';
import { Score } from '../db/models/Score.js';
import { getLoggedInUser } from '../lib/player.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { startOfDayICT, startOfWeekICT, startOfMonthICT } from '../lib/time.js';

export const profileRouter = Router();

// GET /api/profile — hồ sơ người đang đăng nhập (cần cookie session).
profileRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const user = await getLoggedInUser(req);
    if (!user) {
      res.status(401).json({ error: 'Chưa đăng nhập' });
      return;
    }
    await connectDB();

    const pb = user.personalBest ?? 0;
    // Hạng: số người có điểm cao nhất lớn hơn mình, +1.
    const rank = (await User.countDocuments({ personalBest: { $gt: pb } })) + 1;

    const recent = await Score.find({ userId: user._id })
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    res.json({
      profile: {
        nickname: user.nickname,
        avatarUrl: user.avatarUrl ?? null,
        joinedAt: user.get('createdAt'),
        personalBest: pb,
        gamesPlayed: user.gamesPlayed ?? 0,
        rank,
        recentGames: recent.map((s) => ({
          score: s.score,
          status: s.status,
          playedAt: (s as { createdAt?: Date }).createdAt ?? null,
        })),
      },
    });
  })
);

// GET /api/profile/stats — thống kê cá nhân (chỉ tính điểm hợp lệ).
profileRouter.get(
  '/stats',
  asyncHandler(async (req, res) => {
    const user = await getLoggedInUser(req);
    if (!user) {
      res.status(401).json({ error: 'Chưa đăng nhập' });
      return;
    }
    await connectDB();

    const agg = await Score.aggregate([
      { $match: { userId: user._id, status: 'valid' } },
      {
        $group: {
          _id: null,
          totalGames: { $sum: 1 },
          totalScore: { $sum: '$score' },
          best: { $max: '$score' },
          avg: { $avg: '$score' },
          totalDurationMs: { $sum: '$durationMs' },
          longestGameMs: { $max: '$durationMs' },
        },
      },
    ]);
    const a = agg[0] ?? {
      totalGames: 0,
      totalScore: 0,
      best: 0,
      avg: 0,
      totalDurationMs: 0,
      longestGameMs: 0,
    };

    // Thống kê tách theo ngày/tuần/tháng (mốc theo giờ Asia/Ho_Chi_Minh).
    const now = new Date();
    const periods = {
      day: startOfDayICT(now),
      week: startOfWeekICT(now),
      month: startOfMonthICT(now),
    };
    const periodAgg = await Score.aggregate([
      { $match: { userId: user._id, status: 'valid', createdAt: { $gte: periods.month } } },
      {
        $facet: {
          day: [
            { $match: { createdAt: { $gte: periods.day } } },
            { $group: { _id: null, games: { $sum: 1 }, best: { $max: '$score' }, totalScore: { $sum: '$score' } } },
          ],
          week: [
            { $match: { createdAt: { $gte: periods.week } } },
            { $group: { _id: null, games: { $sum: 1 }, best: { $max: '$score' }, totalScore: { $sum: '$score' } } },
          ],
          month: [
            { $group: { _id: null, games: { $sum: 1 }, best: { $max: '$score' }, totalScore: { $sum: '$score' } } },
          ],
        },
      },
    ]);
    const facet = periodAgg[0] ?? { day: [], week: [], month: [] };
    const pick = (arr: Array<{ games: number; best: number; totalScore: number }>) => {
      const r = arr[0];
      return { games: r?.games ?? 0, best: r?.best ?? 0, totalScore: r?.totalScore ?? 0 };
    };

    // Phân bố điểm theo khoảng (histogram đơn giản).
    const buckets = await Score.aggregate([
      { $match: { userId: user._id, status: 'valid' } },
      {
        $bucket: {
          groupBy: '$score',
          boundaries: [0, 5, 10, 20, 30, 50, 100000],
          default: 'other',
          output: { count: { $sum: 1 } },
        },
      },
    ]);

    // Chuỗi điểm 20 ván gần nhất (cũ → mới) để vẽ xu hướng.
    const recent = await Score.find({ userId: user._id, status: 'valid' })
      .sort({ createdAt: -1 })
      .limit(20)
      .select('score createdAt')
      .lean();

    res.json({
      stats: {
        totalGames: a.totalGames,
        totalScore: a.totalScore,
        best: a.best ?? 0,
        avg: a.totalGames ? Math.round((a.avg ?? 0) * 10) / 10 : 0,
        totalDurationMs: a.totalDurationMs ?? 0,
        longestGameMs: a.longestGameMs ?? 0,
        periods: {
          day: pick(facet.day),
          week: pick(facet.week),
          month: pick(facet.month),
        },
        distribution: buckets.map((b) => ({ from: b._id, count: b.count })),
        trend: recent
          .reverse()
          .map((s) => ({ score: s.score, at: (s as { createdAt?: Date }).createdAt ?? null })),
      },
    });
  })
);

// GET /api/profile/history?skip=&limit=&status= — lịch sử ván chơi, phân trang.
profileRouter.get(
  '/history',
  asyncHandler(async (req, res) => {
    const user = await getLoggedInUser(req);
    if (!user) {
      res.status(401).json({ error: 'Chưa đăng nhập' });
      return;
    }
    await connectDB();

    const limit = Math.min(Math.max(Number(req.query.limit ?? 20) || 20, 1), 50);
    const skip = Math.max(Number(req.query.skip ?? 0) || 0, 0);
    const filter: Record<string, unknown> = { userId: user._id };
    const st = req.query.status;
    if (st === 'valid' || st === 'flagged' || st === 'rejected') filter.status = st;

    const [rows, total] = await Promise.all([
      Score.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Score.countDocuments(filter),
    ]);

    res.json({
      total,
      skip,
      limit,
      rows: rows.map((s) => ({
        id: String(s._id),
        score: s.score,
        durationMs: s.durationMs,
        status: s.status,
        playedAt: (s as { createdAt?: Date }).createdAt ?? null,
      })),
    });
  })
);
