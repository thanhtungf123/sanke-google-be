import mongoose, { Schema, InferSchemaType, Model } from 'mongoose';

// Tiến độ thử thách ngày/tuần của một người chơi trong một kỳ cụ thể.
// Danh mục thử thách định nghĩa trong code (lib/challenges.ts).
// periodKey: ngày "YYYY-MM-DD" (daily) hoặc ngày thứ Hai đầu tuần "YYYY-MM-DD" (weekly).
const ChallengeProgressSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    code: { type: String, required: true },
    period: { type: String, enum: ['daily', 'weekly'], required: true },
    periodKey: { type: String, required: true },
    progress: { type: Number, default: 0 },
    target: { type: Number, required: true },
    completed: { type: Boolean, default: false },
    completedAt: { type: Date },
  },
  { timestamps: true }
);

ChallengeProgressSchema.index({ userId: 1, code: 1, periodKey: 1 }, { unique: true });

export type ChallengeProgressDoc = InferSchemaType<typeof ChallengeProgressSchema>;

export const ChallengeProgress: Model<ChallengeProgressDoc> =
  (mongoose.models.ChallengeProgress as Model<ChallengeProgressDoc>) ??
  mongoose.model<ChallengeProgressDoc>('ChallengeProgress', ChallengeProgressSchema);
