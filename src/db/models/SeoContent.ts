import mongoose, { Schema, InferSchemaType, Model } from 'mongoose';

const SeoContentSchema = new Schema(
  {
    pageKey: { type: String, required: true },
    locale: { type: String, enum: ['en', 'vi'], required: true },
    slug: { type: String, required: true },
    seoTitle: { type: String, required: true },
    metaDescription: { type: String, required: true },
    h1: { type: String, required: true },
    // Trang chủ có khối "hero" riêng (tiêu đề lớn + mô tả) — tách khỏi h1 (dùng cho H2 khối SEO).
    heroH1: { type: String, default: '' },
    heroIntro: { type: String, default: '' },
    bodyHtml: { type: String, default: '' },
    canonicalOverride: { type: String },
    robots: {
      index: { type: Boolean, default: true },
      follow: { type: Boolean, default: true },
    },
    ogTitle: { type: String },
    ogDescription: { type: String },
    ogImage: { type: String },
    isPublished: { type: Boolean, default: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

SeoContentSchema.index({ pageKey: 1, locale: 1 }, { unique: true });

export type SeoContentDoc = InferSchemaType<typeof SeoContentSchema>;

export const SeoContent: Model<SeoContentDoc> =
  (mongoose.models.SeoContent as Model<SeoContentDoc>) ??
  mongoose.model<SeoContentDoc>('SeoContent', SeoContentSchema);
