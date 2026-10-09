import mongoose, { Schema, InferSchemaType, Model } from 'mongoose';

// Phiếu nhận thưởng của một người thắng trong một mùa giải (tháng).
// Tạo tự động khi admin CHỐT mùa giải cho Top rewardTiers.
// Vòng đời trạng thái:
//   pending_info   — mới tạo, người thắng chưa điền thông tin nhận thưởng
//   info_submitted — người thắng đã điền STK/họ tên (admin chuẩn bị chuyển khoản)
//   paid           — admin đã chuyển khoản/trao thưởng tay và đánh dấu
//   cancelled       — huỷ (vd người thắng bị khoá, không hợp lệ)
// payout.* là DỮ LIỆU NHẠY CẢM: chỉ chủ phiếu và admin được xem.
const PayoutSchema = new Schema(
  {
    fullName: { type: String },
    bankName: { type: String },
    accountNumber: { type: String },
    phone: { type: String },
    note: { type: String },
  },
  { _id: false }
);

const RewardClaimSchema = new Schema(
  {
    monthKey: { type: String, required: true, index: true }, // "YYYY-MM"
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    nickname: { type: String, required: true }, // chụp tại thời điểm chốt (không đổi về sau)
    rank: { type: Number, required: true },
    best: { type: Number, required: true },
    status: {
      type: String,
      enum: ['pending_info', 'info_submitted', 'paid', 'cancelled'],
      default: 'pending_info',
      index: true,
    },
    payout: { type: PayoutSchema, default: undefined },
    submittedAt: { type: Date },
    paidAt: { type: Date },
    paidByUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    paidNote: { type: String },
  },
  { timestamps: true }
);

// Mỗi người chỉ có 1 phiếu cho mỗi tháng.
RewardClaimSchema.index({ monthKey: 1, userId: 1 }, { unique: true });

export type RewardClaimDoc = InferSchemaType<typeof RewardClaimSchema>;

export const RewardClaim: Model<RewardClaimDoc> =
  (mongoose.models.RewardClaim as Model<RewardClaimDoc>) ??
  mongoose.model<RewardClaimDoc>('RewardClaim', RewardClaimSchema);
