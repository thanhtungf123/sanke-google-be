import mongoose, { Schema, InferSchemaType, Model } from 'mongoose';

const UserSchema = new Schema(
  {
    isGuest: { type: Boolean, default: true, index: true },
    guestToken: { type: String, index: true, sparse: true, unique: true },
    email: { type: String, sparse: true, unique: true },
    emailVerified: { type: Date, default: null },
    passwordHash: { type: String },
    nickname: { type: String, required: true },
    nicknameLower: { type: String, required: true, unique: true },
    avatarUrl: { type: String },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    status: { type: String, enum: ['active', 'banned'], default: 'active' },
    banReason: { type: String },
    personalBest: { type: Number, default: 0, index: true },
    gamesPlayed: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export type UserDoc = InferSchemaType<typeof UserSchema>;

export const User: Model<UserDoc> =
  (mongoose.models.User as Model<UserDoc>) ??
  mongoose.model<UserDoc>('User', UserSchema);
