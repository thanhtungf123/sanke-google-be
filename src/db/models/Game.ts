import mongoose, { Schema, InferSchemaType, Model } from 'mongoose';

// Một trò chơi nhúng (iframe GamePix) do admin thêm/chỉnh ngay trên web — không hard-code.
// Mỗi bản dịch là 1 document; `key` gom các bản dịch cùng một game (cho hreflang + liên kết).
// Game nằm dưới namespace /games/<slug>/ nên slug KHÔNG đụng với slug trang tùy chỉnh ở gốc.
const GameSchema = new Schema(
  {
    key: { type: String, required: true }, // nhóm bản dịch, vd "snake-3d"
    locale: { type: String, enum: ['en', 'vi'], required: true },
    slug: { type: String, required: true }, // path segment dưới /games/, [a-z0-9-]
    // Thứ tự hiển thị trong trang tổng hợp (nhỏ hiện trước). Các bản dịch cùng key dùng chung.
    order: { type: Number, default: 0 },
    title: { type: String, required: true }, // thẻ <title> / SEO
    metaDescription: { type: String, default: '' },
    h1: { type: String, required: true }, // tiêu đề hiển thị trên trang game
    // Thẻ hiển thị trong lưới tổng hợp: ảnh + mô tả ngắn.
    thumbnailUrl: { type: String, default: '' },
    cardDescription: { type: String, default: '' },
    // Nhúng game: URL iframe GamePix (chỉ *.gamepix.com) + tỉ lệ khung hình.
    embedUrl: { type: String, default: '' },
    aspectW: { type: Number, default: 16 },
    aspectH: { type: Number, default: 9 },
    // Nội dung mô tả đầy đủ dưới game (HTML đã sanitize).
    bodyHtml: { type: String, default: '' },
    // Game liên quan: danh sách `key` admin chọn. Để trống => tự lấy các game khác đã publish.
    relatedKeys: { type: [String], default: [] },
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
GameSchema.index({ key: 1, locale: 1 }, { unique: true });
GameSchema.index({ locale: 1, slug: 1 }, { unique: true });

export type GameDoc = InferSchemaType<typeof GameSchema>;

export const Game: Model<GameDoc> =
  (mongoose.models.Game as Model<GameDoc>) ?? mongoose.model<GameDoc>('Game', GameSchema);
