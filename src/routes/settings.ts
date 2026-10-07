import { Router } from 'express';
import { connectDB } from '../db/connect.js';
import { SiteSettings } from '../db/models/SiteSettings.js';
import { asyncHandler } from '../lib/asyncHandler.js';

export const settingsRouter = Router();

// GET /api/settings — cấu hình site công khai (header/footer/favicon) cho frontend.
settingsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    await connectDB();
    const s = await SiteSettings.findOne({ key: 'global' }).lean();
    res.json({
      settings: {
        siteTitle: s?.siteTitle ?? '',
        logoUrl: s?.logoUrl ?? '',
        faviconUrl: s?.faviconUrl ?? '',
        footerText: s?.footerText ?? '',
      },
    });
  })
);
