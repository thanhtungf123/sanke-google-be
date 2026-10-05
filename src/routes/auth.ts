import { Router } from 'express';
import { connectDB } from '../db/connect.js';
import { User } from '../db/models/User.js';
import { registerSchema, loginSchema } from '../validation/schemas.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { createSession, destroySession, getGuestToken } from '../lib/session.js';
import { getLoggedInUser, getGuestByToken, publicUser } from '../lib/player.js';
import { rateLimit, getClientIp } from '../lib/rateLimit.js';
import { asyncHandler } from '../lib/asyncHandler.js';

export const authRouter = Router();

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

authRouter.get(
  '/me',
  asyncHandler(async (req, res) => {
    const user = await getLoggedInUser(req);
    res.json({ user: user ? publicUser(user) : null });
  })
);
