import { Router } from 'express';
import { Types } from 'mongoose';
import { connectDB } from '../db/connect.js';
import { Notification } from '../db/models/Notification.js';
import { getLoggedInUser } from '../lib/player.js';
import { asyncHandler } from '../lib/asyncHandler.js';

export const notificationsRouter = Router();

// GET /api/notifications/unread-count — số thông báo chưa đọc (cho badge trên nav).
notificationsRouter.get(
  '/unread-count',
  asyncHandler(async (req, res) => {
    const user = await getLoggedInUser(req);
    if (!user) {
      res.status(401).json({ error: 'Chưa đăng nhập' });
      return;
    }
    await connectDB();
    const count = await Notification.countDocuments({ userId: user._id, read: false });
    res.json({ count });
  })
);

// GET /api/notifications?skip=&limit= — danh sách thông báo (mới → cũ), phân trang.
notificationsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const user = await getLoggedInUser(req);
    if (!user) {
      res.status(401).json({ error: 'Chưa đăng nhập' });
      return;
    }
    await connectDB();

    const limit = Math.min(Math.max(Number(req.query.limit ?? 20) || 20, 1), 50);
    const skip = Math.max(Number(req.query.skip ?? 0) || 0, 0);

    const [rows, total, unread] = await Promise.all([
      Notification.find({ userId: user._id }).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Notification.countDocuments({ userId: user._id }),
      Notification.countDocuments({ userId: user._id, read: false }),
    ]);

    res.json({
      total,
      unread,
      skip,
      limit,
      rows: rows.map((n) => ({
        id: String(n._id),
        type: n.type,
        messageKey: n.messageKey ?? null,
        data: n.data ?? null,
        title: n.title ?? null,
        body: n.body ?? null,
        read: n.read,
        createdAt: (n as { createdAt?: Date }).createdAt ?? null,
      })),
    });
  })
);

// POST /api/notifications/read-all — đánh dấu tất cả đã đọc.
notificationsRouter.post(
  '/read-all',
  asyncHandler(async (req, res) => {
    const user = await getLoggedInUser(req);
    if (!user) {
      res.status(401).json({ error: 'Chưa đăng nhập' });
      return;
    }
    await connectDB();
    await Notification.updateMany(
      { userId: user._id, read: false },
      { $set: { read: true, readAt: new Date() } }
    );
    res.json({ ok: true });
  })
);

// POST /api/notifications/:id/read — đánh dấu 1 thông báo đã đọc.
notificationsRouter.post(
  '/:id/read',
  asyncHandler(async (req, res) => {
    const user = await getLoggedInUser(req);
    if (!user) {
      res.status(401).json({ error: 'Chưa đăng nhập' });
      return;
    }
    const { id } = req.params;
    if (!Types.ObjectId.isValid(id)) {
      res.status(400).json({ error: 'ID không hợp lệ' });
      return;
    }
    await connectDB();
    const n = await Notification.findOneAndUpdate(
      { _id: id, userId: user._id },
      { $set: { read: true, readAt: new Date() } },
      { new: true }
    );
    if (!n) {
      res.status(404).json({ error: 'Không tìm thấy thông báo' });
      return;
    }
    res.json({ ok: true });
  })
);
