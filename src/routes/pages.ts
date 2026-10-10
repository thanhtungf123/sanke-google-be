import { Router } from 'express';
import { connectDB } from '../db/connect.js';
import { CustomPage } from '../db/models/CustomPage.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { sanitizeBodyHtml } from '../lib/sanitizeHtml.js';
import { CONTENT_LOCALES } from '../validation/schemas.js';

export const pagesRouter = Router();

// GET /api/pages/menu/:locale — trang đã publish của 1 ngôn ngữ, để hiện trên header.
pagesRouter.get(
  '/menu/:locale',
  asyncHandler(async (req, res) => {
    const { locale } = req.params;
    if (!CONTENT_LOCALES.includes(locale as (typeof CONTENT_LOCALES)[number]))
      return res.json({ rows: [] });
    await connectDB();
    const docs = await CustomPage.find({ locale, isPublished: true })
      .select('slug title h1 createdAt')
      .sort({ createdAt: 1 })
      .lean();
    res.json({
      rows: docs.map((d) => ({
        slug: d.slug,
        // Nhãn hiển thị trên header: ưu tiên H1 (ngắn gọn) rồi tới title.
        label: (d.h1 || d.title || d.slug).trim(),
      })),
    });
  })
);

// GET /api/pages/sitemap — danh sách trang đã publish (cho sitemap.xml).
pagesRouter.get(
  '/sitemap',
  asyncHandler(async (_req, res) => {
    await connectDB();
    const docs = await CustomPage.find({ isPublished: true, 'robots.index': { $ne: false } })
      .select('key locale slug updatedAt')
      .lean();
    res.json({
      rows: docs.map((d) => ({
        key: d.key,
        locale: d.locale,
        slug: d.slug,
        updatedAt: (d as { updatedAt?: Date }).updatedAt ?? null,
      })),
    });
  })
);

// GET /api/pages/:locale/:slug — nội dung công khai 1 trang + bản dịch khác (hreflang).
pagesRouter.get(
  '/:locale/:slug',
  asyncHandler(async (req, res) => {
    const { locale, slug } = req.params;
    if (!CONTENT_LOCALES.includes(locale as (typeof CONTENT_LOCALES)[number]))
      return res.status(404).json({ error: 'Không tìm thấy' });

    await connectDB();
    const doc = await CustomPage.findOne({ locale, slug, isPublished: true }).lean();
    if (!doc) return res.status(404).json({ error: 'Không tìm thấy' });

    // Các bản dịch publish khác cùng key → map { locale: slug } cho hreflang.
    const siblings = await CustomPage.find({ key: doc.key, isPublished: true })
      .select('locale slug')
      .lean();
    const alternates: Record<string, string> = {};
    for (const s of siblings) alternates[s.locale] = s.slug;

    res.json({
      page: {
        key: doc.key,
        locale: doc.locale,
        slug: doc.slug,
        title: doc.title,
        metaDescription: doc.metaDescription ?? '',
        h1: doc.h1,
        bodyHtml: sanitizeBodyHtml(doc.bodyHtml ?? ''),
        robots: doc.robots ?? { index: true, follow: true },
        alternates,
      },
    });
  })
);
