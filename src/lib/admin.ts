import type { Request, Response, NextFunction } from 'express';
import type { Types } from 'mongoose';
import { AuditLog } from '../db/models/AuditLog.js';
import { getLoggedInUser, type UserHydrated } from './player.js';

// Gắn user admin đã xác thực vào request để handler dùng lại.
export interface AdminRequest extends Request {
  adminUser?: UserHydrated;
}

// Middleware: chỉ cho qua nếu đang đăng nhập VÀ role = 'admin'.
export async function requireAdmin(
  req: AdminRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const user = await getLoggedInUser(req);
  if (!user) {
    res.status(401).json({ error: 'Chưa đăng nhập' });
    return;
  }
  if (user.role !== 'admin') {
    res.status(403).json({ error: 'Không có quyền truy cập' });
    return;
  }
  req.adminUser = user;
  next();
}

// Ghi một dòng nhật ký hành động quản trị.
export async function writeAudit(opts: {
  actorId: Types.ObjectId | string;
  action: string;
  targetType: 'user' | 'score' | 'content' | 'page' | 'tournament';
  targetId: Types.ObjectId | string;
  reason?: string;
  meta?: Record<string, unknown>;
}): Promise<void> {
  await AuditLog.create({
    actorId: opts.actorId,
    action: opts.action,
    targetType: opts.targetType,
    targetId: opts.targetId,
    reason: opts.reason,
    meta: opts.meta,
  });
}
