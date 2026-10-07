import mongoose, { Schema, InferSchemaType, Model } from 'mongoose';

// Thành tích (huy hiệu) đã mở khóa của một người chơi.
// Danh mục thành tích định nghĩa trong code (lib/achievements.ts); ở đây chỉ lưu
// code + thời điểm mở khóa. Unique (userId, code) để không mở khóa trùng.
const UserAchievementSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    code: { type: String, required: true },
    unlockedAt: { type: Date, default: () => new Date() },
  },
  { timestamps: true }
);

UserAchievementSchema.index({ userId: 1, code: 1 }, { unique: true });

export type UserAchievementDoc = InferSchemaType<typeof UserAchievementSchema>;

export const UserAchievement: Model<UserAchievementDoc> =
  (mongoose.models.UserAchievement as Model<UserAchievementDoc>) ??
  mongoose.model<UserAchievementDoc>('UserAchievement', UserAchievementSchema);
