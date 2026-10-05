import { Router } from 'express';
import { connectDB } from '../db/connect.js';
import { SeoContent } from '../db/models/SeoContent.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { CONTENT_PAGE_KEYS, CONTENT_LOCALES } from '../validation/schemas.js';

export const contentRouter = Router();

// GET /api/content/:pageKey/:locale — nội dung công khai của một trang.
// Trả 404 nếu chưa có / chưa publish; frontend sẽ fallback về text i18n.
contentRouter.get(
  '/:pageKey/:locale',
  asyncHandler(async (req, res) => {
    const { pageKey, locale } = req.params;
    if (
      !CONTENT_PAGE_KEYS.includes(pageKey as (typeof CONTENT_PAGE_KEYS)[number]) ||
      !CONTENT_LOCALES.includes(locale as (typeof CONTENT_LOCALES)[number])
    ) {
      return res.status(404).json({ error: 'Không tìm thấy' });
    }
    await connectDB();
    const doc = await SeoContent.findOne({ pageKey, locale, isPublished: true }).lean();
    if (!doc) return res.status(404).json({ error: 'Không tìm thấy' });
    res.json({
      content: {
        pageKey: doc.pageKey,
        locale: doc.locale,
        seoTitle: doc.seoTitle,
        metaDescription: doc.metaDescription,
        h1: doc.h1,
        bodyHtml: doc.bodyHtml ?? '',
        canonicalOverride: doc.canonicalOverride ?? null,
        robots: doc.robots ?? { index: true, follow: true },
        ogTitle: doc.ogTitle ?? null,
        ogDescription: doc.ogDescription ?? null,
        ogImage: doc.ogImage ?? null,
      },
    });
  })
);
