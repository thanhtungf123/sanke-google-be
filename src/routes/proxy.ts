import { Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler.js';

export const proxyRouter = Router();

// Chỉ cho proxy tài nguyên của google.com (module/bundle của game Snake).
const ALLOWED = /^https?:\/\/(www\.)?google\.com\//;

// GET /api/gproxy?u=<encoded google url>
// Tải tài nguyên google.com phía server rồi trả về cùng origin -> tránh CORS,
// giúp game Google tải đủ module (gồm code lưu điểm).
proxyRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const u = String(req.query.u || '');
    if (!ALLOWED.test(u)) {
      res.status(400).json({ error: 'URL không được phép' });
      return;
    }
    try {
      const upstream = await fetch(u, {
        headers: { 'User-Agent': req.headers['user-agent'] ?? 'Mozilla/5.0' },
      });
      const contentType =
        upstream.headers.get('content-type') ?? 'application/javascript; charset=utf-8';
      const buf = Buffer.from(await upstream.arrayBuffer());
      res.set('Content-Type', contentType);
      res.set('Cache-Control', 'public, max-age=86400');
      res.status(upstream.status).send(buf);
    } catch (e) {
      res.status(502).json({ error: 'Proxy lỗi', detail: (e as Error).message });
    }
  })
);
