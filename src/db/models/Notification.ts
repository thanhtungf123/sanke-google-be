import mongoose, { Schema, InferSchemaType, Model } from 'mongoose';

// Hộp thư / thông báo của người chơi.
// Nội dung đa ngôn ngữ: lưu `messageKey` + `data` để frontend render theo i18n;
// `title`/`body` chỉ dùng khi cần ghi đè văn bản tự do (vd thông báo admin/thưởng).
const NotificationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: {
      type: String,
      enum: ['achievement', 'challenge', 'reward', 'system'],
      default: 'system',
    },
    messageKey: { type: String }, // key i18n dưới Notifications.messages (vd 'achievementUnlocked')
    data: { type: Schema.Types.Mixed }, // tham số cho i18n + link (vd { name, score, link })
    title: { type: String }, // ghi đè văn bản (tuỳ chọn)
    body: { type: String }, // ghi đè văn bản (tuỳ chọn)
    read: { type: Boolean, default: false },
    readAt: { type: Date },
  },
  { timestamps: true }
);

NotificationSchema.index({ userId: 1, read: 1, createdAt: -1 });

export type NotificationDoc = InferSchemaType<typeof NotificationSchema>;

export const Notification: Model<NotificationDoc> =
  (mongoose.models.Notification as Model<NotificationDoc>) ??
  mongoose.model<NotificationDoc>('Notification', NotificationSchema);
