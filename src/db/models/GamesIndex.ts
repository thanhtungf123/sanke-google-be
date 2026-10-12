import mongoose, { Schema, InferSchemaType, Model } from 'mongoose';

// Cấu hình trang tổng hợp game (/all-games/ · /vi/tro-choi/). Mỗi ngôn ngữ 1 document.
// Admin sửa toàn bộ: thẻ title, meta description, H1 và đoạn giới thiệu — ngay trên web.
const GamesIndexSchema = new Schema(
  {
    locale: { type: String, enum: ['en', 'vi'], required: true, unique: true },
    title: { type: String, default: '' }, // thẻ <title> / SEO
    metaDescription: { type: String, default: '' },
    h1: { type: String, default: '' }, // tiêu đề lớn trên đầu trang
    introHtml: { type: String, default: '' }, // đoạn giới thiệu dưới H1 (HTML đã sanitize)
    robots: {
      index: { type: Boolean, default: true },
      follow: { type: Boolean, default: true },
    },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

export type GamesIndexDoc = InferSchemaType<typeof GamesIndexSchema>;

export const GamesIndex: Model<GamesIndexDoc> =
  (mongoose.models.GamesIndex as Model<GamesIndexDoc>) ??
  mongoose.model<GamesIndexDoc>('GamesIndex', GamesIndexSchema);
