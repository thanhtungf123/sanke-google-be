import { Router } from 'express';
import { randomBytes, createHash } from 'crypto';
import { connectDB } from '../db/connect.js';
import { User } from '../db/models/User.js';
import { PasswordReset } from '../db/models/PasswordReset.js';
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from '../validation/schemas.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { createSession, destroySession, getGuestToken } from '../lib/session.js';
import { getLoggedInUser, getGuestByToken, publicUser } from '../lib/player.js';
import { rateLimit, getClientIp } from '../lib/rateLimit.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { sendEmail } from '../lib/email.js';

export const authRouter = Router();

const RESET_TTL_MS = 60 * 60 * 1000; // 1 giờ

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// Base URL của frontend để dựng link đặt lại mật khẩu (lấy origin đầu tiên của FRONTEND_URL).
function frontendBase(): string {
  const raw = (process.env.FRONTEND_URL || 'http://localhost:3000').split(',')[0].trim();
  return raw.replace(/\/+$/, '');
}

function resetEmailHtml(link: string): string {
  return `
  <div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto">
    <h2>🐍 Snake — Đặt lại mật khẩu / Reset your password</h2>
    <p>Bạn (hoặc ai đó) đã yêu cầu đặt lại mật khẩu. Nhấn nút dưới đây để đặt mật khẩu mới. Link có hiệu lực trong 1 giờ.</p>
    <p>You (or someone) requested a password reset. Click the button below to set a new password. This link expires in 1 hour.</p>
    <p style="margin:24px 0">
      <a href="${link}" style="background:#16a34a;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">
        Đặt lại mật khẩu / Reset password
      </a>
    </p>
    <p style="font-size:13px;color:#555">Nếu nút không hoạt động, dán link này vào trình duyệt / If the button doesn't work, paste this link:<br>${link}</p>
    <p style="font-size:13px;color:#555">Không yêu cầu? Bỏ qua email này. / Didn't request this? Ignore this email.</p>
  </div>`;
}

authRouter.post(
  '/register',
  asyncHandler(async (req, res) => {
    const ip = getClientIp(req);
    const rl = await rateLimit(`register:${ip}`, 10, 60 * 60 * 1000);
    if (!rl.allowed) return res.status(429).json({ error: 'Quá nhiều lần thử, thử lại sau.' });

    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: 'Dữ liệu không hợp lệ', details: parsed.error.flatten() });

    const { email, password, nickname } = parsed.data;
    const emailLower = email.toLowerCase();
    const nickLower = nickname.toLowerCase();

    await connectDB();
    if (await User.findOne({ email: emailLower }))
      return res.status(409).json({ error: 'Email đã được dùng' });
    if (await User.findOne({ nicknameLower: nickLower }))
      return res.status(409).json({ error: 'Nickname đã tồn tại' });

    const passwordHash = await hashPassword(password);
    const guestToken = getGuestToken(req);
    const guest = guestToken ? await getGuestByToken(guestToken) : null;

    let user;
    if (guest) {
      guest.isGuest = false;
      guest.email = emailLower;
      guest.passwordHash = passwordHash;
      guest.nickname = nickname;
      guest.nicknameLower = nickLower;
      guest.guestToken = undefined;
      user = await guest.save();
    } else {
      user = await User.create({
        isGuest: false,
        email: emailLower,
        passwordHash,
        nickname,
        nicknameLower: nickLower,
      });
    }

    await createSession(res, String(user._id));
    res.json({ user: publicUser(user) });
  })
);

authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const ip = getClientIp(req);
    const rl = await rateLimit(`login:${ip}`, 20, 15 * 60 * 1000);
    if (!rl.allowed) return res.status(429).json({ error: 'Quá nhiều lần thử, thử lại sau.' });

    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Dữ liệu không hợp lệ' });

    const { email, password } = parsed.data;
    await connectDB();
    const user = await User.findOne({ email: email.toLowerCase(), isGuest: false });
    if (!user || !user.passwordHash || !(await verifyPassword(password, user.passwordHash)))
      return res.status(401).json({ error: 'Email hoặc mật khẩu không đúng' });
    if (user.status === 'banned') return res.status(403).json({ error: 'Tài khoản đã bị khoá' });

    await createSession(res, String(user._id));
    res.json({ user: publicUser(user) });
  })
);

authRouter.post(
  '/logout',
  asyncHandler(async (_req, res) => {
    destroySession(res);
    res.json({ ok: true });
  })
);

// POST /api/auth/forgot-password — gửi email link đặt lại mật khẩu.
// Luôn trả 200 (không tiết lộ email nào tồn tại).
authRouter.post(
  '/forgot-password',
  asyncHandler(async (req, res) => {
    const ip = getClientIp(req);
    const rl = await rateLimit(`forgot:${ip}`, 5, 60 * 60 * 1000);
    if (!rl.allowed) return res.status(429).json({ error: 'Quá nhiều lần thử, thử lại sau.' });

    const parsed = forgotPasswordSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Dữ liệu không hợp lệ' });

    const email = parsed.data.email.toLowerCase();
    await connectDB();
    const user = await User.findOne({ email, isGuest: false });

    if (user && user.status !== 'banned') {
      const token = randomBytes(32).toString('hex');
      await PasswordReset.create({
        userId: user._id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + RESET_TTL_MS),
      });
      const link = `${frontendBase()}/reset-password/?token=${token}`;
      try {
        await sendEmail({
          to: email,
          subject: 'Đặt lại mật khẩu Snake / Reset your Snake password',
          html: resetEmailHtml(link),
          text: `Đặt lại mật khẩu / Reset password: ${link}`,
        });
      } catch (e) {
        console.error('[forgot-password] gửi email lỗi:', e);
      }
    }

    res.json({ ok: true });
  })
);

// POST /api/auth/reset-password — đặt mật khẩu mới bằng token.
authRouter.post(
  '/reset-password',
  asyncHandler(async (req, res) => {
    const ip = getClientIp(req);
    const rl = await rateLimit(`reset:${ip}`, 20, 60 * 60 * 1000);
    if (!rl.allowed) return res.status(429).json({ error: 'Quá nhiều lần thử, thử lại sau.' });

    const parsed = resetPasswordSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Dữ liệu không hợp lệ' });

    const { token, newPassword } = parsed.data;
    await connectDB();
    const record = await PasswordReset.findOne({
      tokenHash: hashToken(token),
      usedAt: null,
      expiresAt: { $gt: new Date() },
    });
    if (!record) return res.status(400).json({ error: 'Link không hợp lệ hoặc đã hết hạn' });

    const user = await User.findById(record.userId);
    if (!user || user.isGuest || user.status === 'banned')
      return res.status(400).json({ error: 'Không thể đặt lại mật khẩu cho tài khoản này' });

    user.passwordHash = await hashPassword(newPassword);
    await user.save();

    record.usedAt = new Date();
    await record.save();
    // Vô hiệu hoá các token đặt lại khác còn hiệu lực của user này.
    await PasswordReset.updateMany(
      { userId: user._id, usedAt: null },
      { $set: { usedAt: new Date() } }
    );

    res.json({ ok: true });
  })
);

authRouter.get(
  '/me',
  asyncHandler(async (req, res) => {
    const user = await getLoggedInUser(req);
    res.json({ user: user ? publicUser(user) : null });
  })
);
