import type { Types } from 'mongoose';
import { Notification } from '../db/models/Notification.js';

export interface NotifyInput {
  type?: 'achievement' | 'challenge' | 'reward' | 'system';
  messageKey?: string;
  data?: Record<string, unknown>;
  title?: string;
  body?: string;
}

// Tạo 1 thông báo cho người chơi. Dùng bởi achievements/challenges/thưởng.
export async function notify(userId: Types.ObjectId | string, input: NotifyInput) {
  return Notification.create({
    userId,
    type: input.type ?? 'system',
    messageKey: input.messageKey,
    data: input.data,
    title: input.title,
    body: input.body,
  });
}

// Tạo nhiều thông báo cùng lúc (vd trao thưởng cho nhiều người).
export async function notifyMany(
  items: Array<{ userId: Types.ObjectId | string } & NotifyInput>
) {
  if (items.length === 0) return;
  await Notification.insertMany(
    items.map((it) => ({
      userId: it.userId,
      type: it.type ?? 'system',
      messageKey: it.messageKey,
      data: it.data,
      title: it.title,
      body: it.body,
    }))
  );
}
