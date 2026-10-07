import mongoose, { Schema, InferSchemaType, Model } from 'mongoose';

// Cấu hình chung của site (singleton). Dùng key cố định 'global'.
// Hình ảnh (logo/favicon) lưu trên Cloudinary, ở đây chỉ lưu URL.
const SiteSettingsSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, default: 'global' },
    siteTitle: { type: String, default: '' }, // chữ tiêu đề cạnh logo ở header
    logoUrl: { type: String, default: '' }, // logo header (Cloudinary URL)
    faviconUrl: { type: String, default: '' }, // favicon tab trình duyệt
    footerText: { type: String, default: '' }, // dòng chữ ở footer
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

export type SiteSettingsDoc = InferSchemaType<typeof SiteSettingsSchema>;

export const SiteSettings: Model<SiteSettingsDoc> =
  (mongoose.models.SiteSettings as Model<SiteSettingsDoc>) ??
  mongoose.model<SiteSettingsDoc>('SiteSettings', SiteSettingsSchema);
