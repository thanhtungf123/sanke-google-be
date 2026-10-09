import mongoose, { Schema, InferSchemaType, Model } from 'mongoose';

const ScoreSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    nickname: { type: String, required: true },
    isGuest: { type: Boolean, default: false },
    score: { type: Number, required: true },
    startedAt: { type: Date, required: true },
    endedAt: { type: Date, required: true },
    durationMs: { type: Number, required: true },
    source: { type: String, enum: ['google', 'canvas'], default: 'google' },
    gameVersion: { type: String },
    seed: { type: Number },
    inputLog: { type: String },
    status: { type: String, enum: ['valid', 'flagged', 'rejected'], default: 'valid' },
    rejectedReason: { type: String },
    // Các dấu hiệu bất thường anti-cheat phát hiện (vd 'too_fast', 'pb_spike'). Để admin duyệt.
    flags: { type: [String], default: [] },
    clientMeta: {
      ipHash: { type: String },
      ua: { type: String },
    },
    tournamentId: { type: Schema.Types.ObjectId, ref: 'Tournament', default: null },
  },
  { timestamps: true }
);

ScoreSchema.index({ status: 1, score: -1, createdAt: 1 });
ScoreSchema.index({ status: 1, createdAt: -1 });
ScoreSchema.index({ userId: 1, createdAt: -1 });
ScoreSchema.index({ tournamentId: 1, status: 1, score: -1 });

export type ScoreDoc = InferSchemaType<typeof ScoreSchema>;

export const Score: Model<ScoreDoc> =
  (mongoose.models.Score as Model<ScoreDoc>) ??
  mongoose.model<ScoreDoc>('Score', ScoreSchema);
