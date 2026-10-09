import type { Types } from 'mongoose';
import { connectDB } from '../db/connect.js';
import { RewardClaim, type RewardClaimDoc } from '../db/models/RewardClaim.js';
import { notify } from './notifications.js';
import { writeAudit } from './admin.js';
import type { BoardEntry } from './season.js';

export type ClaimStatus = 'pending_info' | 'info_submitted' | 'paid' | 'cancelled';

export interface PayoutInfo {
  fullName: string;
  bankName: string;
  accountNumber: string;
  phone?: string;
  note?: string;
}

// Tạo phiếu nhận thưởng cho Top người thắng khi CHỐT mùa giải.
// Dùng upsert + setOnInsert để không ghi đè phiếu đã tồn tại (an toàn khi chạy lại).
export async function createClaimsForWinners(
  monthKey: string,
  winners: BoardEntry[]
): Promise<void> {
  if (winners.length === 0) return;
  await connectDB();
  await Promise.all(
    winners.map((w) =>
      RewardClaim.updateOne(
        { monthKey, userId: w.userId },
        {
          $setOnInsert: {
            monthKey,
            userId: w.userId,
            nickname: w.nickname,
            rank: w.rank,
            best: w.best,
            status: 'pending_info',
          },
        },
        { upsert: true }
      )
    )
  );
}

function httpError(status: number, message: string): Error & { status: number } {
  const e = new Error(message) as Error & { status: number };
  e.status = status;
  return e;
}

// --- Người chơi ---

// Danh sách phiếu thưởng của một người (mới → cũ).
export async function listMyClaims(userId: Types.ObjectId | string) {
  await connectDB();
  const rows = await RewardClaim.find({ userId }).sort({ monthKey: -1 }).lean();
  return rows.map(shapeClaimForOwner);
}

// Người thắng nhập/sửa thông tin nhận thưởng. Chỉ cho phép khi chưa trả/chưa huỷ.
export async function submitClaimInfo(
  claimId: string,
  userId: Types.ObjectId | string,
  payout: PayoutInfo
) {
  await connectDB();
  const claim = await RewardClaim.findOne({ _id: claimId, userId });
  if (!claim) throw httpError(404, 'Không tìm thấy phiếu thưởng');
  if (claim.status === 'paid') throw httpError(409, 'Phiếu đã được trả, không thể sửa');
  if (claim.status === 'cancelled') throw httpError(409, 'Phiếu đã bị huỷ');

  claim.payout = {
    fullName: payout.fullName,
    bankName: payout.bankName,
    accountNumber: payout.accountNumber,
    phone: payout.phone,
    note: payout.note,
  };
  claim.status = 'info_submitted';
  claim.submittedAt = new Date();
  await claim.save();
  return shapeClaimForOwner(claim.toObject() as RewardClaimDoc);
}

// --- Admin ---

export async function listClaimsAdmin(filter: {
  monthKey?: string;
  status?: ClaimStatus;
}) {
  await connectDB();
  const q: Record<string, unknown> = {};
  if (filter.monthKey) q.monthKey = filter.monthKey;
  if (filter.status) q.status = filter.status;
  const rows = await RewardClaim.find(q)
    .sort({ monthKey: -1, rank: 1 })
    .populate('userId', 'nickname email')
    .lean();
  return rows.map((c) => ({
    id: String(c._id),
    monthKey: c.monthKey,
    rank: c.rank,
    best: c.best,
    nickname:
      c.userId && typeof c.userId === 'object' && 'nickname' in c.userId
        ? ((c.userId as { nickname?: string }).nickname ?? c.nickname)
        : c.nickname,
    email:
      c.userId && typeof c.userId === 'object' && 'email' in c.userId
        ? ((c.userId as { email?: string }).email ?? null)
        : null,
    status: c.status as ClaimStatus,
    payout: c.payout ?? null,
    submittedAt: (c as { submittedAt?: Date }).submittedAt ?? null,
    paidAt: (c as { paidAt?: Date }).paidAt ?? null,
    paidNote: c.paidNote ?? null,
    createdAt: (c as { createdAt?: Date }).createdAt ?? null,
  }));
}

// Admin đổi trạng thái phiếu: đánh dấu đã trả / huỷ / mở lại.
// Trả về claim sau cập nhật; bắn thông báo cho người thắng khi đánh dấu đã trả.
export async function setClaimStatusAdmin(
  claimId: string,
  adminId: Types.ObjectId | string,
  status: ClaimStatus,
  note: string | undefined
) {
  await connectDB();
  const claim = await RewardClaim.findById(claimId);
  if (!claim) throw httpError(404, 'Không tìm thấy phiếu thưởng');

  const prev = claim.status;
  claim.status = status;
  if (status === 'paid') {
    claim.paidAt = new Date();
    claim.paidByUserId = adminId as Types.ObjectId;
    claim.paidNote = note;
  } else {
    // Mở lại / huỷ: xoá dấu đã trả.
    claim.paidAt = undefined;
    claim.paidByUserId = undefined;
    claim.paidNote = status === 'cancelled' ? note : undefined;
  }
  await claim.save();

  await writeAudit({
    actorId: adminId,
    action: 'reward.status',
    targetType: 'reward',
    targetId: claim._id,
    reason: note,
    meta: {
      from: prev,
      to: status,
      monthKey: claim.monthKey,
      rank: claim.rank,
      nickname: claim.nickname,
    },
  });

  // Thông báo cho người thắng khi đã trả thưởng.
  if (status === 'paid' && prev !== 'paid') {
    await notify(claim.userId, {
      type: 'reward',
      messageKey: 'rewardPaid',
      data: { rank: claim.rank, month: claim.monthKey },
    });
  }

  return {
    id: String(claim._id),
    status: claim.status as ClaimStatus,
    paidAt: claim.paidAt ?? null,
  };
}

// Chỉ chủ phiếu mới gọi hàm này → được xem đầy đủ STK của chính mình.
function shapeClaimForOwner(c: RewardClaimDoc & { _id?: unknown }) {
  return {
    id: String((c as { _id?: unknown })._id),
    monthKey: c.monthKey,
    rank: c.rank,
    best: c.best,
    status: c.status as ClaimStatus,
    payout: c.payout ?? null,
    submittedAt: (c as { submittedAt?: Date }).submittedAt ?? null,
    paidAt: (c as { paidAt?: Date }).paidAt ?? null,
    paidNote: c.paidNote ?? null,
  };
}
