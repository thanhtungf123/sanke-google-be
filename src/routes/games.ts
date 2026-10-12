import { Router } from 'express';
import { connectDB } from '../db/connect.js';
import { Game } from '../db/models/Game.js';
import { GamesIndex } from '../db/models/GamesIndex.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { sanitizeBodyHtml } from '../lib/sanitizeHtml.js';
import { CONTENT_LOCALES } from '../validation/schemas.js';

export const gamesRouter = Router();

function isLocale(v: string): v is (typeof CONTENT_LOCALES)[number] {
  return CONTENT_LOCALES.includes(v as (typeof CONTENT_LOCALES)[number]);
}

// Thẻ game rút gọn hiển thị trong lưới tổng hợp.
function toCard(d: {
  key: string;
  slug: string;
  h1: string;
  title: string;
  thumbnailUrl?: string;
  cardDescription?: string;
}) {
  return {
    key: d.key,
    slug: d.slug,
    title: d.h1 || d.title,
    thumbnailUrl: d.thumbnailUrl ?? '',
    cardDescription: d.cardDescription ?? '',
  };
}

// GET /api/games/sitemap — các game đã publish (cho sitemap.xml).
gamesRouter.get(
  '/sitemap',
  asyncHandler(async (_req, res) => {
    await connectDB();
    const docs = await Game.find({ isPublished: true, 'robots.index': { $ne: false } })
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

// GET /api/games/:locale — cấu hình trang tổng hợp + danh sách game đã publish.
gamesRouter.get(
  '/:locale',
  asyncHandler(async (req, res) => {
    const { locale } = req.params;
    if (!isLocale(locale)) return res.status(404).json({ error: 'Không tìm thấy' });
    await connectDB();

    const [index, games] = await Promise.all([
      GamesIndex.findOne({ locale }).lean(),
      Game.find({ locale, isPublished: true }).sort({ order: 1, createdAt: 1 }).lean(),
    ]);

    res.json({
      index: {
        title: index?.title ?? '',
        metaDescription: index?.metaDescription ?? '',
        h1: index?.h1 ?? '',
        introHtml: sanitizeBodyHtml(index?.introHtml ?? ''),
        robots: index?.robots ?? { index: true, follow: true },
      },
      games: games.map(toCard),
    });
  })
);

// GET /api/games/:locale/:slug — chi tiết 1 game + game liên quan + bản dịch khác (hreflang).
gamesRouter.get(
  '/:locale/:slug',
  asyncHandler(async (req, res) => {
    const { locale, slug } = req.params;
    if (!isLocale(locale)) return res.status(404).json({ error: 'Không tìm thấy' });
    await connectDB();

    const doc = await Game.findOne({ locale, slug, isPublished: true }).lean();
    if (!doc) return res.status(404).json({ error: 'Không tìm thấy' });

    // Bản dịch publish cùng key → { locale: slug } cho hreflang.
    const siblings = await Game.find({ key: doc.key, isPublished: true })
      .select('locale slug')
      .lean();
    const alternates: Record<string, string> = {};
    for (const s of siblings) alternates[s.locale] = s.slug;

    // Game liên quan: ưu tiên danh sách admin chọn (relatedKeys), nếu trống thì tự lấy game khác.
    const picked = (doc.relatedKeys ?? []).filter((k) => k !== doc.key);
    let related;
    if (picked.length) {
      const rows = await Game.find({ locale, isPublished: true, key: { $in: picked } })
        .select('key slug h1 title thumbnailUrl cardDescription')
        .lean();
      // Giữ đúng thứ tự admin đã chọn.
      const byKey = new Map(rows.map((r) => [r.key, r]));
      related = picked.map((k) => byKey.get(k)).filter(Boolean) as typeof rows;
    } else {
      related = await Game.find({ locale, isPublished: true, key: { $ne: doc.key } })
        .select('key slug h1 title thumbnailUrl cardDescription')
        .sort({ order: 1, createdAt: 1 })
        .limit(6)
        .lean();
    }

    res.json({
      game: {
        key: doc.key,
        locale: doc.locale,
        slug: doc.slug,
        title: doc.title,
        metaDescription: doc.metaDescription ?? '',
        h1: doc.h1,
        thumbnailUrl: doc.thumbnailUrl ?? '',
        embedUrl: doc.embedUrl ?? '',
        aspectW: doc.aspectW ?? 16,
        aspectH: doc.aspectH ?? 9,
        bodyHtml: sanitizeBodyHtml(doc.bodyHtml ?? ''),
        robots: doc.robots ?? { index: true, follow: true },
        alternates,
      },
      related: related.map(toCard),
    });
  })
);
