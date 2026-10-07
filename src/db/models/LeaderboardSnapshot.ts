import mongoose, { Schema, InferSchemaType, Model } from 'mongoose';

// Bảng xếp hạng ĐÓNG BĂNG của một mùa giải đã chốt (không tính lại động).
// Lưu top-N (SNAPSHOT_SIZE) để người chơi xem lại tháng cũ.
const SnapshotEntrySchema = new Schema(
  {
    rank: { type: Number, required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    nickname: { type: String, required: true },
    best: { type: Number, required: true },
    avatarUrl: { type: String, default: null },
  },
  { _id: false }
);

const LeaderboardSnapshotSchema = new Schema(
  {
    monthKey: { type: String, required: true, unique: true }, // "YYYY-MM"
    entries: { type: [SnapshotEntrySchema], default: [] },
    rewardTiers: { type: Number, default: 3 },
    generatedAt: { type: Date, default: () => new Date() },
  },
  { timestamps: true }
);

export type LeaderboardSnapshotDoc = InferSchemaType<typeof LeaderboardSnapshotSchema>;

export const LeaderboardSnapshot: Model<LeaderboardSnapshotDoc> =
  (mongoose.models.LeaderboardSnapshot as Model<LeaderboardSnapshotDoc>) ??
  mongoose.model<LeaderboardSnapshotDoc>('LeaderboardSnapshot', LeaderboardSnapshotSchema);
