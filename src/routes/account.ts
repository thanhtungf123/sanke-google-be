import { Router } from 'express';
import { connectDB } from '../db/connect.js';
import { User } from '../db/models/User.js';
import { getLoggedInUser, publicUser } from '../lib/player.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { updateAccountSchema, changePasswordSchema } from '../validation/schemas.js';
import { rateLimit, getClientIp } from '../lib/rateLimit.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { cloudinaryConfigured, signUpload } from '../lib/cloudinary.js';

export const accountRouter = Router();

// GET /api/account/upload/signature — chữ ký để user đã đăng nhập upload AVATAR lên Cloudinary.
// Ký ở backend (secret không ra client); trình duyệt upload thẳng vào folder 'avatars'.
accountRouter.get(
  '/upload/signature',
  asyncHandler(async (req, res) => {
    const user = await getLoggedInUser(req);
    if (!user) return res.status(401).json({ error: 'Chưa đăng nhập' });
    if (!cloudinaryConfigured())
      return res
        .status(400)
        .json({ error: 'Cloudinary chưa cấu hình (đặt CLOUDINARY_* trong .env backend)' });
    res.json(signUpload('avatars'));
  })
);

// GET /api/account — thông tin tài khoản của chính mình (gồm email, riêng tư).
accountRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const user = await getLoggedInUser(req);
    if (!user) return res.status(401).json({ error: 'Chưa đăng nhập' });
    res.json({
      account: {
        ...publicUser(user),
        email: user.email ?? null,
      },
    });
  })
);

// PATCH /api/account — cập nhật nickname / email / avatar.
accountRouter.patch(
  '/',
  asyncHandler(async (req, res) => {
    const user = await getLoggedInUser(req);
    if (!user) return res.status(401).json({ error: 'Chưa đăng nhập' });

    const parsed = updateAccountSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: 'Dữ liệu không hợp lệ', details: parsed.error.flatten() });

    await connectDB();
    const { nickname, email, avatarUrl } = parsed.data;

    if (nickname !== undefined) {
      const lower = nickname.toLowerCase();
      if (lower !== user.nicknameLower) {
        const taken = await User.findOne({ nicknameLower: lower, _id: { $ne: user._id } });
        if (taken) return res.status(409).json({ error: 'Nickname đã tồn tại' });
        user.nickname = nickname;
        user.nicknameLower = lower;
      }
    }

    if (email !== undefined) {
      const lower = email.toLowerCase();
      if (lower !== (user.email ?? '')) {
        const taken = await User.findOne({ email: lower, _id: { $ne: user._id } });
        if (taken) return res.status(409).json({ error: 'Email đã được dùng' });
        user.email = lower;
        user.emailVerified = null;
      }
    }

    if (avatarUrl !== undefined) {
      user.avatarUrl = avatarUrl === '' ? undefined : avatarUrl;
    }

    await user.save();
    res.json({ account: { ...publicUser(user), email: user.email ?? null } });
  })
);

// POST /api/account/password — đổi mật khẩu (cần mật khẩu hiện tại).
accountRouter.post(
  '/password',
  asyncHandler(async (req, res) => {
    const user = await getLoggedInUser(req);
    if (!user) return res.status(401).json({ error: 'Chưa đăng nhập' });

    const ip = getClientIp(req);
    const rl = await rateLimit(`chpw:${ip}`, 10, 15 * 60 * 1000);
    if (!rl.allowed) return res.status(429).json({ error: 'Quá nhiều lần thử, thử lại sau.' });

    const parsed = changePasswordSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Dữ liệu không hợp lệ' });

    if (!user.passwordHash || !(await verifyPassword(parsed.data.currentPassword, user.passwordHash)))
      return res.status(401).json({ error: 'Mật khẩu hiện tại không đúng' });

    user.passwordHash = await hashPassword(parsed.data.newPassword);
    await user.save();
    res.json({ ok: true });
  })
);
