import mongoose, { Schema, InferSchemaType, Model } from 'mongoose';

const RateLimitSchema = new Schema({
  _id: { type: String },
  count: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
});

export type RateLimitDoc = InferSchemaType<typeof RateLimitSchema>;

export const RateLimit: Model<RateLimitDoc> =
  (mongoose.models.RateLimit as Model<RateLimitDoc>) ??
  mongoose.model<RateLimitDoc>('RateLimit', RateLimitSchema);
