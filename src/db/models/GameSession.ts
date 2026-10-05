import mongoose, { Schema, InferSchemaType, Model } from 'mongoose';

const GameSessionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    seed: { type: Number, required: true },
    startedAt: { type: Date, required: true },
    submitted: { type: Boolean, default: false },
    tournamentId: { type: Schema.Types.ObjectId, ref: 'Tournament', default: null },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
  },
  { timestamps: true }
);

export type GameSessionDoc = InferSchemaType<typeof GameSessionSchema>;

export const GameSession: Model<GameSessionDoc> =
  (mongoose.models.GameSession as Model<GameSessionDoc>) ??
  mongoose.model<GameSessionDoc>('GameSession', GameSessionSchema);
