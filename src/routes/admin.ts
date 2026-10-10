import { Router } from 'express';
import { connectDB } from '../db/connect.js';
import { User } from '../db/models/User.js';
import { Score } from '../db/models/Score.js';
import { SeoContent } from '../db/models/SeoContent.js';
import { CustomPage } from '../db/models/CustomPage.js';
import { AuditLog } from '../db/models/AuditLog.js';
import { SiteSettings } from '../db/models/SiteSettings.js';
import { cloudinaryConfigured, signUpload } from '../lib/cloudinary.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { requireAdmin, writeAudit, type AdminRequest } from '../lib/admin.js';
import { sanitizeBodyHtml } from '../lib/sanitizeHtml.js';
import {
  getSeasonBoard,
  closeSeason,
  countPendingFlagged,
  countMonthlyPlayers,
  defaultRewardTiers,
  listRecentSeasons,
} from '../lib/season.js';
import { recentMonthKeys, monthKeyICT, isValidMonthKey } from '../lib/time.js';
import { listClaimsAdmin, setClaimStatusAdmin, type ClaimStatus } from '../lib/rewards.js';
import {
  banUserSchema,
  scoreStatusSchema,
  contentUpsertSchema,
  customPageCreateSchema,
  customPageUpdateSchema,
  siteSettingsSchema,
  rewardStatusSchema,
  CONTENT_PAGE_KEYS,
  CONTENT_LOCALES,
} from '../validation/schemas.js';

// Lỗi trùng unique index của Mongo.
function isDuplicateKeyError(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: number }).code === 11000;
}

export const adminRouter = Router();

// Mọi route dưới /api/admin đều cần quyền admin.
adminRouter.use(requireAdmin);

function pageInt(v: unknown, def: number, max: number): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return def;
  return Math.min(Math.floor(n), max);
}

// GET /api/admin/stats — số liệu tổng quan.
adminRouter.get(
  '/stats',
  asyncHandler(async (_req, res) => {
    await connectDB();
    const since = new Date(Date.now() - 86_400_000);
    const [users, guests, banned, scores, flagged, rejected, gamesToday] =
      await Promise.all([
        User.countDocuments({ isGuest: false }),
        User.countDocuments({ isGuest: true }),
        User.countDocuments({ status: 'banned' }),
        Score.countDocuments({}),
        Score.countDocuments({ status: 'flagged' }),
        Score.countDocuments({ status: 'rejected' }),
        Score.countDocuments({ createdAt: { $gte: since } }),
      ]);
    res.json({
      stats: { users, guests, banned, scores, flagged, rejected, gamesToday },
    });
  })
);

// GET /api/admin/users?q=&skip=&limit=&status=
adminRouter.get(
  '/users',
  asyncHandler(async (req, res) => {
    await connectDB();
    const limit = pageInt(req.query.limit, 25, 100) || 25;
    const skip = pageInt(req.query.skip, 0, 100000);
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const statusFilter = req.query.status;

    const roleFilter = req.query.role;

    const filter: Record<string, unknown> = { isGuest: false };
    if (statusFilter === 'banned' || statusFilter === 'active') filter.status = statusFilter;
    if (roleFilter === 'admin' || roleFilter === 'user') filter.role = roleFilter;
    if (q) {
      const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ nickname: rx }, { email: rx }];
    }

    const [rows, total] = await Promise.all([
      User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      User.countDocuments(filter),
    ]);

    res.json({
      total,
      skip,
      limit,
      rows: rows.map((u) => ({
        id: String(u._id),
        nickname: u.nickname,
        email: u.email ?? null,
        role: u.role,
        status: u.status,
        banReason: u.banReason ?? null,
        personalBest: u.personalBest ?? 0,
        gamesPlayed: u.gamesPlayed ?? 0,
        joinedAt: (u as { createdAt?: Date }).createdAt ?? null,
      })),
    });
  })
);

// POST /api/admin/users/:id/ban
adminRouter.post(
  '/users/:id/ban',
  asyncHandler(async (req: AdminRequest, res) => {
    const parsed = banUserSchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: 'Dữ liệu không hợp lệ' });
    await connectDB();
    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ error: 'Không tìm thấy người dùng' });
    if (target.role === 'admin')
      return res.status(403).json({ error: 'Không thể khoá tài khoản admin' });

    target.status = 'banned';
    target.banReason = parsed.data.reason;
    await target.save();
    await writeAudit({
      actorId: req.adminUser!._id,
      action: 'user.ban',
      targetType: 'user',
      targetId: target._id,
      reason: parsed.data.reason,
      meta: { nickname: target.nickname },
    });
    res.json({ ok: true, status: target.status });
  })
);

// POST /api/admin/users/:id/unban
adminRouter.post(
  '/users/:id/unban',
  asyncHandler(async (req: AdminRequest, res) => {
    const parsed = banUserSchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: 'Dữ liệu không hợp lệ' });
    await connectDB();
    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ error: 'Không tìm thấy người dùng' });
    target.status = 'active';
    target.banReason = undefined;
    await target.save();
    await writeAudit({
      actorId: req.adminUser!._id,
      action: 'user.unban',
      targetType: 'user',
      targetId: target._id,
      reason: parsed.data.reason,
      meta: { nickname: target.nickname },
    });
    res.json({ ok: true, status: target.status });
  })
);

// GET /api/admin/scores?status=&skip=&limit=&userId=
adminRouter.get(
  '/scores',
  asyncHandler(async (req, res) => {
    await connectDB();
    const limit = pageInt(req.query.limit, 25, 100) || 25;
    const skip = pageInt(req.query.skip, 0, 100000);
    const filter: Record<string, unknown> = {};
    const st = req.query.status;
    if (st === 'valid' || st === 'flagged' || st === 'rejected') filter.status = st;
    if (typeof req.query.userId === 'string' && req.query.userId) filter.userId = req.query.userId;
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (q) filter.nickname = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const guest = req.query.guest;
    if (guest === 'exclude') filter.isGuest = { $ne: true };
    else if (guest === 'only') filter.isGuest = true;

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
        userId: String(s.userId),
        nickname: s.nickname,
        isGuest: s.isGuest,
        score: s.score,
        durationMs: s.durationMs,
        status: s.status,
        rejectedReason: s.rejectedReason ?? null,
        flags: s.flags ?? [],
        ipHash: s.clientMeta?.ipHash ?? null,
        playedAt: (s as { createdAt?: Date }).createdAt ?? null,
      })),
    });
  })
);

// POST /api/admin/scores/:id/status  { status, reason? }
adminRouter.post(
  '/scores/:id/status',
  asyncHandler(async (req: AdminRequest, res) => {
    const parsed = scoreStatusSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Dữ liệu không hợp lệ' });
    await connectDB();
    const score = await Score.findById(req.params.id);
    if (!score) return res.status(404).json({ error: 'Không tìm thấy điểm' });

    const prev = score.status;
    score.status = parsed.data.status;
    score.rejectedReason = parsed.data.reason;
    await score.save();

    // Nếu đổi trạng thái của điểm, tính lại personalBest của người chơi (chỉ tính điểm 'valid').
    const best = await Score.find({ userId: score.userId, status: 'valid' })
      .sort({ score: -1 })
      .limit(1)
      .lean();
    await User.findByIdAndUpdate(score.userId, {
      personalBest: best.length ? best[0].score : 0,
    });

    await writeAudit({
      actorId: req.adminUser!._id,
      action: 'score.status',
      targetType: 'score',
      targetId: score._id,
      reason: parsed.data.reason,
      meta: { from: prev, to: parsed.data.status, nickname: score.nickname, score: score.score },
    });
    res.json({ ok: true, status: score.status });
  })
);

// --- Quản lý nội dung (SeoContent) ---

// GET /api/admin/content — danh sách tất cả bản ghi, gom theo pageKey.
adminRouter.get(
  '/content',
  asyncHandler(async (_req, res) => {
    await connectDB();
    const docs = await SeoContent.find({}).lean();
    res.json({
      pageKeys: CONTENT_PAGE_KEYS,
      locales: CONTENT_LOCALES,
      rows: docs.map((d) => ({
        pageKey: d.pageKey,
        locale: d.locale,
        slug: d.slug,
        seoTitle: d.seoTitle,
        metaDescription: d.metaDescription,
        h1: d.h1,
        heroH1: d.heroH1 ?? '',
        heroIntro: d.heroIntro ?? '',
        bodyHtml: d.bodyHtml ?? '',
        canonicalOverride: d.canonicalOverride ?? '',
        ogTitle: d.ogTitle ?? '',
        ogDescription: d.ogDescription ?? '',
        ogImage: d.ogImage ?? '',
        robots: d.robots ?? { index: true, follow: true },
        isPublished: d.isPublished ?? true,
        updatedAt: (d as { updatedAt?: Date }).updatedAt ?? null,
      })),
    });
  })
);

// PUT /api/admin/content/:pageKey/:locale — tạo/cập nhật.
adminRouter.put(
  '/content/:pageKey/:locale',
  asyncHandler(async (req: AdminRequest, res) => {
    const { pageKey, locale } = req.params;
    if (!CONTENT_PAGE_KEYS.includes(pageKey as (typeof CONTENT_PAGE_KEYS)[number]))
      return res.status(400).json({ error: 'pageKey không hợp lệ' });
    if (!CONTENT_LOCALES.includes(locale as (typeof CONTENT_LOCALES)[number]))
      return res.status(400).json({ error: 'locale không hợp lệ' });

    const parsed = contentUpsertSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: 'Dữ liệu không hợp lệ', details: parsed.error.flatten() });

    // Làm sạch HTML trước khi lưu (chống XSS dù chỉ admin nhập).
    const bodyHtml = sanitizeBodyHtml(parsed.data.bodyHtml);

    await connectDB();
    const doc = await SeoContent.findOneAndUpdate(
      { pageKey, locale },
      { ...parsed.data, bodyHtml, pageKey, locale, updatedBy: req.adminUser!._id },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    await writeAudit({
      actorId: req.adminUser!._id,
      action: 'content.upsert',
      targetType: 'content',
      targetId: doc!._id,
      meta: { pageKey, locale },
    });
    res.json({ ok: true });
  })
);

// --- Trang tùy chỉnh (CustomPage) ---

// GET /api/admin/pages — danh sách tất cả trang tùy chỉnh.
adminRouter.get(
  '/pages',
  asyncHandler(async (_req, res) => {
    await connectDB();
    const docs = await CustomPage.find({}).sort({ key: 1, locale: 1 }).lean();
    res.json({
      rows: docs.map((d) => ({
        id: String(d._id),
        key: d.key,
        locale: d.locale,
        slug: d.slug,
        title: d.title,
        metaDescription: d.metaDescription ?? '',
        h1: d.h1,
        bodyHtml: d.bodyHtml ?? '',
        robots: d.robots ?? { index: true, follow: true },
        isPublished: d.isPublished ?? false,
        updatedAt: (d as { updatedAt?: Date }).updatedAt ?? null,
      })),
    });
  })
);

// POST /api/admin/pages — tạo trang mới.
adminRouter.post(
  '/pages',
  asyncHandler(async (req: AdminRequest, res) => {
    const parsed = customPageCreateSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: 'Dữ liệu không hợp lệ', details: parsed.error.flatten() });

    await connectDB();
    try {
      const doc = await CustomPage.create({
        ...parsed.data,
        bodyHtml: sanitizeBodyHtml(parsed.data.bodyHtml),
        updatedBy: req.adminUser!._id,
      });
      await writeAudit({
        actorId: req.adminUser!._id,
        action: 'page.create',
        targetType: 'page',
        targetId: doc._id,
        meta: { key: doc.key, locale: doc.locale, slug: doc.slug },
      });
      res.status(201).json({ ok: true, id: String(doc._id) });
    } catch (e) {
      if (isDuplicateKeyError(e))
        return res.status(409).json({ error: 'Trùng (key, ngôn ngữ) hoặc (ngôn ngữ, slug) đã tồn tại' });
      throw e;
    }
  })
);

// PUT /api/admin/pages/:id — cập nhật (không đổi key/locale).
adminRouter.put(
  '/pages/:id',
  asyncHandler(async (req: AdminRequest, res) => {
    const parsed = customPageUpdateSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: 'Dữ liệu không hợp lệ', details: parsed.error.flatten() });

    await connectDB();
    const page = await CustomPage.findById(req.params.id);
    if (!page) return res.status(404).json({ error: 'Không tìm thấy trang' });

    page.slug = parsed.data.slug;
    page.title = parsed.data.title;
    page.metaDescription = parsed.data.metaDescription;
    page.h1 = parsed.data.h1;
    page.bodyHtml = sanitizeBodyHtml(parsed.data.bodyHtml);
    if (parsed.data.robots) page.robots = parsed.data.robots;
    if (typeof parsed.data.isPublished === 'boolean') page.isPublished = parsed.data.isPublished;
    page.updatedBy = req.adminUser!._id;

    try {
      await page.save();
    } catch (e) {
      if (isDuplicateKeyError(e))
        return res.status(409).json({ error: 'Slug này đã dùng cho trang khác cùng ngôn ngữ' });
      throw e;
    }
    await writeAudit({
      actorId: req.adminUser!._id,
      action: 'page.update',
      targetType: 'page',
      targetId: page._id,
      meta: { key: page.key, locale: page.locale, slug: page.slug },
    });
    res.json({ ok: true });
  })
);

// DELETE /api/admin/pages/:id
adminRouter.delete(
  '/pages/:id',
  asyncHandler(async (req: AdminRequest, res) => {
    await connectDB();
    const page = await CustomPage.findByIdAndDelete(req.params.id);
    if (!page) return res.status(404).json({ error: 'Không tìm thấy trang' });
    await writeAudit({
      actorId: req.adminUser!._id,
      action: 'page.delete',
      targetType: 'page',
      targetId: page._id,
      meta: { key: page.key, locale: page.locale, slug: page.slug },
    });
    res.json({ ok: true });
  })
);

// GET /api/admin/audit?skip=&limit=
adminRouter.get(
  '/audit',
  asyncHandler(async (req, res) => {
    await connectDB();
    const limit = pageInt(req.query.limit, 30, 100) || 30;
    const skip = pageInt(req.query.skip, 0, 100000);
    const tt = req.query.targetType;
    const auditFilter: Record<string, unknown> = {};
    if (
      tt === 'user' ||
      tt === 'score' ||
      tt === 'content' ||
      tt === 'page' ||
      tt === 'tournament' ||
      tt === 'reward'
    )
      auditFilter.targetType = tt;
    const [rows, total] = await Promise.all([
      AuditLog.find(auditFilter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('actorId', 'nickname')
        .lean(),
      AuditLog.countDocuments(auditFilter),
    ]);
    res.json({
      total,
      skip,
      limit,
      rows: rows.map((a) => ({
        id: String(a._id),
        actor:
          a.actorId && typeof a.actorId === 'object' && 'nickname' in a.actorId
            ? (a.actorId as { nickname?: string }).nickname ?? '—'
            : '—',
        action: a.action,
        targetType: a.targetType,
        targetId: String(a.targetId),
        reason: a.reason ?? null,
        meta: a.meta ?? null,
        at: (a as { createdAt?: Date }).createdAt ?? null,
      })),
    });
  })
);

// --- Mùa giải / Giải đấu (V3) ---

// GET /api/admin/seasons?count= — danh sách tháng gần đây + trạng thái + số điểm nghi ngờ + số người chơi.
adminRouter.get(
  '/seasons',
  asyncHandler(async (req, res) => {
    await connectDB();
    const count = Math.min(Math.max(Number(req.query.count ?? 12) || 12, 1), 36);
    const months = recentMonthKeys(count);
    const base = await listRecentSeasons(months);
    const rows = await Promise.all(
      base.map(async (s) => ({
        ...s,
        pendingFlagged: await countPendingFlagged(s.monthKey),
        players: await countMonthlyPlayers(s.monthKey),
      }))
    );
    res.json({ current: monthKeyICT(), defaultRewardTiers: defaultRewardTiers(), rows });
  })
);

// GET /api/admin/seasons/:month/preview — xem trước bảng (top 20) + số điểm nghi ngờ.
adminRouter.get(
  '/seasons/:month/preview',
  asyncHandler(async (req, res) => {
    const month = req.params.month;
    if (!isValidMonthKey(month)) return res.status(400).json({ error: 'Key tháng không hợp lệ' });
    const [board, pendingFlagged] = await Promise.all([
      getSeasonBoard(month, 10, 0),
      countPendingFlagged(month),
    ]);
    res.json({ ...board, pendingFlagged });
  })
);

// POST /api/admin/seasons/:month/close — chốt mùa giải (body: { rewardTiers?, force? }).
adminRouter.post(
  '/seasons/:month/close',
  asyncHandler(async (req: AdminRequest, res) => {
    const month = req.params.month;
    if (!isValidMonthKey(month)) return res.status(400).json({ error: 'Key tháng không hợp lệ' });
    const body = (req.body ?? {}) as { rewardTiers?: unknown; force?: unknown };
    const rewardTiers = Number(body.rewardTiers);
    const force = body.force === true;
    try {
      const result = await closeSeason(
        month,
        req.adminUser!._id,
        Number.isFinite(rewardTiers) ? rewardTiers : defaultRewardTiers(),
        force
      );
      res.json({ ok: true, ...result });
    } catch (e) {
      const status = (e as { status?: number }).status ?? 500;
      res.status(status).json({ error: (e as Error).message || 'Lỗi chốt mùa giải' });
    }
  })
);

// --- Nhận thưởng (RewardClaim) — chứa STK nhạy cảm, chỉ admin xem ---

const CLAIM_STATUSES: ClaimStatus[] = ['pending_info', 'info_submitted', 'paid', 'cancelled'];

// GET /api/admin/rewards?monthKey=&status= — danh sách phiếu thưởng + thông tin chuyển khoản.
adminRouter.get(
  '/rewards',
  asyncHandler(async (req, res) => {
    const monthKey =
      typeof req.query.monthKey === 'string' && isValidMonthKey(req.query.monthKey)
        ? req.query.monthKey
        : undefined;
    const status =
      typeof req.query.status === 'string' && CLAIM_STATUSES.includes(req.query.status as ClaimStatus)
        ? (req.query.status as ClaimStatus)
        : undefined;
    const rows = await listClaimsAdmin({ monthKey, status });
    res.json({ rows });
  })
);

// POST /api/admin/rewards/:id/status — đổi trạng thái phiếu (đánh dấu đã trả / huỷ / mở lại).
adminRouter.post(
  '/rewards/:id/status',
  asyncHandler(async (req: AdminRequest, res) => {
    const parsed = rewardStatusSchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: 'Dữ liệu không hợp lệ' });
    try {
      const result = await setClaimStatusAdmin(
        req.params.id,
        req.adminUser!._id,
        parsed.data.status,
        parsed.data.note
      );
      res.json({ ok: true, ...result });
    } catch (e) {
      const status = (e as { status?: number }).status ?? 500;
      res.status(status).json({ error: (e as Error).message || 'Lỗi cập nhật phiếu thưởng' });
    }
  })
);

// --- Cấu hình site (header/footer/favicon) ---

// GET /api/admin/settings
adminRouter.get(
  '/settings',
  asyncHandler(async (_req, res) => {
    await connectDB();
    const s = await SiteSettings.findOne({ key: 'global' }).lean();
    res.json({
      settings: {
        siteTitle: s?.siteTitle ?? '',
        logoUrl: s?.logoUrl ?? '',
        faviconUrl: s?.faviconUrl ?? '',
        footerText: s?.footerText ?? '',
        footerLinks: (s?.footerLinks ?? []).map((l) => ({ label: l.label ?? '', url: l.url ?? '' })),
      },
      cloudinaryEnabled: cloudinaryConfigured(),
    });
  })
);

// PUT /api/admin/settings
adminRouter.put(
  '/settings',
  asyncHandler(async (req: AdminRequest, res) => {
    const parsed = siteSettingsSchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: 'Dữ liệu không hợp lệ' });
    await connectDB();
    const doc = await SiteSettings.findOneAndUpdate(
      { key: 'global' },
      { ...parsed.data, key: 'global', updatedBy: req.adminUser!._id },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    await writeAudit({
      actorId: req.adminUser!._id,
      action: 'settings.update',
      targetType: 'content',
      targetId: doc!._id,
    });
    res.json({ ok: true });
  })
);

// GET /api/admin/upload/signature?folder= — chữ ký để upload ảnh lên Cloudinary.
adminRouter.get(
  '/upload/signature',
  asyncHandler(async (req, res) => {
    if (!cloudinaryConfigured())
      return res
        .status(400)
        .json({ error: 'Cloudinary chưa cấu hình (đặt CLOUDINARY_* trong .env backend)' });
    const raw = typeof req.query.folder === 'string' ? req.query.folder : 'site';
    const folder = /^[a-z0-9/_-]{1,60}$/i.test(raw) ? raw : 'site';
    res.json(signUpload(folder));
  })
);
