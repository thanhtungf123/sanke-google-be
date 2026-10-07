import mongoose, { Schema, InferSchemaType, Model } from 'mongoose';

// Yêu cầu đặt lại mật khẩu.
// Chỉ lưu HASH của token (không lưu token thô) để lộ DB cũng không dùng được.
// TTL index tự xoá bản ghi hết hạn.
const PasswordResetSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, index: true },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
    usedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export type PasswordResetDoc = InferSchemaType<typeof PasswordResetSchema>;

export const PasswordReset: Model<PasswordResetDoc> =
  (mongoose.models.PasswordReset as Model<PasswordResetDoc>) ??
  mongoose.model<PasswordResetDoc>('PasswordReset', PasswordResetSchema);
