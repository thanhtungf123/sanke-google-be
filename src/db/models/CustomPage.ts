import mongoose, { Schema, InferSchemaType, Model } from 'mongoose';

// Trang nội dung tùy ý do admin tạo, hiển thị tại /[locale]/p/<slug>.
// Mỗi bản dịch là 1 document; `key` gom các bản dịch cùng một trang (cho hreflang).
const CustomPageSchema = new Schema(
  {
    key: { type: String, required: true }, // nhóm bản dịch, vd "promo-2026"
    locale: { type: String, enum: ['en', 'vi'], required: true },
    slug: { type: String, required: true }, // path segment, [a-z0-9-]
    title: { type: String, required: true },
    metaDescription: { type: String, default: '' },
    h1: { type: String, required: true },
    bodyHtml: { type: String, default: '' },
    robots: {
      index: { type: Boolean, default: true },
      follow: { type: Boolean, default: true },
    },
    isPublished: { type: Boolean, default: false },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

// 1 bản dịch cho mỗi (key, locale); slug là duy nhất trong mỗi locale.
CustomPageSchema.index({ key: 1, locale: 1 }, { unique: true });
CustomPageSchema.index({ locale: 1, slug: 1 }, { unique: true });

export type CustomPageDoc = InferSchemaType<typeof CustomPageSchema>;

export const CustomPage: Model<CustomPageDoc> =
  (mongoose.models.CustomPage as Model<CustomPageDoc>) ??
  mongoose.model<CustomPageDoc>('CustomPage', CustomPageSchema);
