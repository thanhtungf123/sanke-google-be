import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { authRouter } from './routes/auth.js';
import { gameRouter } from './routes/game.js';
import { leaderboardRouter } from './routes/leaderboard.js';
import { healthRouter } from './routes/health.js';
import { proxyRouter } from './routes/proxy.js';
import { profileRouter } from './routes/profile.js';
import { adminRouter } from './routes/admin.js';
import { contentRouter } from './routes/content.js';
import { pagesRouter } from './routes/pages.js';
import { accountRouter } from './routes/account.js';
import { notificationsRouter } from './routes/notifications.js';
import { settingsRouter } from './routes/settings.js';

const app = express();

app.disable('x-powered-by');

// Security headers cơ bản (không cần dependency ngoài).
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  next();
});

// CORS: cho phép frontend gửi cookie (credentials).
// Khoan dung với dấu '/' thừa; và cho mọi *.vercel.app + localhost (tiện demo),
// để khỏi phải sửa FRONTEND_URL mỗi lần Vercel đổi đuôi domain.
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:3000')
  .split(',')
  .map((s) => s.trim().replace(/\/+$/, ''))
  .filter(Boolean);

function isAllowedOrigin(origin: string): boolean {
  const o = origin.replace(/\/+$/, '');
  if (allowedOrigins.includes(o)) return true;
  if (/^https:\/\/([a-z0-9-]+\.)*vercel\.app$/i.test(o)) return true;
  if (/^http:\/\/localhost(:\d+)?$/i.test(o)) return true;
  return false;
}

app.use(
  cors({
    // Không có Origin (same-origin, health check, curl) → cho qua.
    origin: (origin, cb) => cb(null, !origin || isAllowedOrigin(origin)),
    credentials: true,
  })
);

app.use(express.json({ limit: '256kb' }));
app.use(cookieParser());

app.use('/api/auth', authRouter);
app.use('/api/game', gameRouter);
app.use('/api/leaderboard', leaderboardRouter);
app.use('/api/health', healthRouter);
app.use('/api/gproxy', proxyRouter);
app.use('/api/profile', profileRouter);
app.use('/api/admin', adminRouter);
app.use('/api/content', contentRouter);
app.use('/api/pages', pagesRouter);
app.use('/api/account', accountRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/settings', settingsRouter);

app.get('/', (_req, res) => {
  res.json({ ok: true, service: 'google-snake-api' });
});

// Error handler
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[API error]', err);
  res.status(500).json({ error: 'Lỗi máy chủ' });
});

const PORT = Number(process.env.PORT ?? 4000);
app.listen(PORT, () => {
  console.log(`API đang chạy tại http://localhost:${PORT}`);
});
