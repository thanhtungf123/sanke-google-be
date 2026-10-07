import mongoose, { Schema, InferSchemaType, Model } from 'mongoose';

// Mùa giải theo tháng dương lịch (ICT). Bản ghi chỉ tạo khi admin CHỐT tháng.
// Tháng chưa có bản ghi => coi như đang mở (open).
const SeasonSchema = new Schema(
  {
    monthKey: { type: String, required: true, unique: true }, // "YYYY-MM"
    status: { type: String, enum: ['open', 'closed'], default: 'closed' },
    closedAt: { type: Date },
    closedByUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    rewardTiers: { type: Number, default: 3 }, // số bậc được thưởng (cấu hình được)
    totalPlayers: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export type SeasonDoc = InferSchemaType<typeof SeasonSchema>;

export const Season: Model<SeasonDoc> =
  (mongoose.models.Season as Model<SeasonDoc>) ??
  mongoose.model<SeasonDoc>('Season', SeasonSchema);
