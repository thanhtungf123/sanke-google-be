import { Router } from 'express';
import { Types } from 'mongoose';
import { getLoggedInUser } from '../lib/player.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { listMyClaims, submitClaimInfo } from '../lib/rewards.js';
import { rewardInfoSchema } from '../validation/schemas.js';

export const rewardsRouter = Router();

// GET /api/rewards/me — danh sách phiếu thưởng của người đang đăng nhập.
rewardsRouter.get(
  '/me',
  asyncHandler(async (req, res) => {
    const user = await getLoggedInUser(req);
    if (!user) {
      res.status(401).json({ error: 'Chưa đăng nhập' });
      return;
    }
    const rows = await listMyClaims(user._id);
    res.json({ rows });
  })
);

// POST /api/rewards/:id/info — người thắng nhập/sửa thông tin nhận thưởng.
rewardsRouter.post(
  '/:id/info',
  asyncHandler(async (req, res) => {
    const user = await getLoggedInUser(req);
    if (!user) {
      res.status(401).json({ error: 'Chưa đăng nhập' });
      return;
    }
    const { id } = req.params;
    if (!Types.ObjectId.isValid(id)) {
      res.status(400).json({ error: 'ID không hợp lệ' });
      return;
    }
    const parsed = rewardInfoSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: 'Dữ liệu không hợp lệ', details: parsed.error.flatten() });
      return;
    }
    try {
      const claim = await submitClaimInfo(id, user._id, parsed.data);
      res.json({ ok: true, claim });
    } catch (e) {
      const status = (e as { status?: number }).status ?? 500;
      res.status(status).json({ error: (e as Error).message || 'Lỗi cập nhật phiếu thưởng' });
    }
  })
);
