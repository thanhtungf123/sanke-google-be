import 'dotenv/config';

// Ghim ngưỡng anti-cheat để test TẤT ĐỊNH, bất kể .env thật đặt gì.
// (antiCheat.ts đọc env lúc gọi hàm nên gán ở đây là thắng.)
process.env.ANTICHEAT_MAX_SCORE = '1000';
process.env.ANTICHEAT_MIN_MS_PER_POINT = '250';
process.env.ANTICHEAT_MIN_DURATION_MS = '1000';
process.env.ANTICHEAT_PB_SPIKE_FACTOR = '2.5';
process.env.ANTICHEAT_PB_SPIKE_MIN_GAMES = '5';
process.env.ANTICHEAT_PB_SPIKE_MIN_SCORE = '30';
process.env.ANTICHEAT_OUTLIER_FACTOR = '2';
process.env.ANTICHEAT_OUTLIER_MIN_BASELINE = '20';

import mongoose from 'mongoose';
import type { Request } from 'express';
import { connectDB } from '../db/connect.js';
import { User } from '../db/models/User.js';
import { Score } from '../db/models/Score.js';
import { GameSession } from '../db/models/GameSession.js';
import { Notification } from '../db/models/Notification.js';
import { evaluateScore, hashIp, type ScoreFlag } from '../lib/antiCheat.js';

// Script TEST TÍCH HỢP anti-cheat (L1–L3) trên DB thật. Tự dọn sạch khi xong.
//   npx tsx src/scripts/testAntiCheat.ts        (chạy test)
//   npx tsx src/scripts/testAntiCheat.ts --clean (chỉ dọn data test)

const DOMAIN = 'anticheat.test';
const TTL_MS = 2 * 60 * 60 * 1000;

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean, extra?: string): void {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ''}`);
  }
}

function sameFlags(got: ScoreFlag[], want: ScoreFlag[]): boolean {
  const a = [...got].sort();
  const b = [...want].sort();
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

async function cleanup(): Promise<number> {
  const users = await User.find({ email: { $regex: `@${DOMAIN}$` } })
    .select('_id')
    .lean();
  const ids = users.map((u) => u._id);
  await Promise.all([
    Score.deleteMany({ userId: { $in: ids } }),
    GameSession.deleteMany({ userId: { $in: ids } }),
    Notification.deleteMany({ userId: { $in: ids } }),
    User.deleteMany({ _id: { $in: ids } }),
  ]);
  return ids.length;
}

async function makeUser(nick: string, isGuest = false) {
  return User.create({
    isGuest,
    email: `${nick.toLowerCase()}@${DOMAIN}`,
    nickname: nick,
    nicknameLower: nick.toLowerCase(),
    role: 'user',
    status: 'active',
  });
}

async function main(): Promise<void> {
  const cleanOnly = process.argv.includes('--clean');
  await connectDB();

  const removed = await cleanup();
  console.log(`Dọn ${removed} user test cũ (@${DOMAIN}).`);
  if (cleanOnly) {
    await mongoose.disconnect();
    return;
  }

  // Người chơi chính + 1 người làm "baseline" (có điểm valid) cho test outlier.
  const player = await makeUser('AcMain');
  const helper = await makeUser('AcBase');

  // Chèn 1 điểm valid 50 cho helper để baseline >= 50 (vượt mọi điểm nhỏ có sẵn).
  await Score.collection.insertOne({
    userId: helper._id,
    nickname: helper.nickname,
    isGuest: false,
    score: 50,
    startedAt: new Date(Date.now() - 50 * 400),
    endedAt: new Date(),
    durationMs: 50 * 400,
    source: 'google',
    gameVersion: 'current',
    status: 'valid',
    flags: [],
    clientMeta: { ua: 'anticheat-test' },
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  console.log('\n[L2] evaluateScore — luật hợp lý hoá điểm');

  // 1) Bình thường → valid, không cờ.
  {
    const r = await evaluateScore({
      score: 40,
      durationMs: 40 * 400,
      userId: player._id,
      isGuest: false,
      priorPersonalBest: 30,
      gamesPlayed: 10,
    });
    check('điểm bình thường → valid, không cờ', r.status === 'valid' && r.flags.length === 0, JSON.stringify(r));
  }

  // 2) Bất khả thi (> trần 1000) → reject.
  {
    const r = await evaluateScore({
      score: 2000,
      durationMs: 2000 * 400,
      userId: player._id,
      isGuest: false,
      priorPersonalBest: 0,
      gamesPlayed: 0,
    });
    check('điểm 2000 (> trần) → rejected + cờ impossible', r.status === 'rejected' && sameFlags(r.flags, ['impossible']), JSON.stringify(r));
  }

  // 3) Quá nhanh (duration < score*250ms) → flag too_fast.
  {
    const r = await evaluateScore({
      score: 50,
      durationMs: 5000, // < 50*250=12500
      userId: player._id,
      isGuest: false,
      priorPersonalBest: 45,
      gamesPlayed: 10,
    });
    check('điểm 50 trong 5s → flagged + cờ too_fast', r.status === 'flagged' && sameFlags(r.flags, ['too_fast']), JSON.stringify(r));
  }

  // 4) Quá ngắn (< 1s) nhưng không quá nhanh (score nhỏ) → flag too_short.
  {
    const r = await evaluateScore({
      score: 1,
      durationMs: 800, // <1000 nhưng >=1*250
      userId: player._id,
      isGuest: false,
      priorPersonalBest: 1,
      gamesPlayed: 10,
    });
    check('điểm 1 trong 0.8s → flagged + cờ too_short', r.status === 'flagged' && sameFlags(r.flags, ['too_short']), JSON.stringify(r));
  }

  // 5) Nhảy vọt so với kỷ lục cũ → flag pb_spike.
  {
    const r = await evaluateScore({
      score: 100,
      durationMs: 100 * 400,
      userId: player._id,
      isGuest: false,
      priorPersonalBest: 30, // 100 > 30*2.5=75
      gamesPlayed: 10,
    });
    check('điểm 100 với PB cũ 30 → flagged + cờ pb_spike', r.status === 'flagged' && r.flags.includes('pb_spike'), JSON.stringify(r));
  }

  // 6) Outlier toàn cục → flag global_outlier (tạm nới trần để không đụng reject).
  {
    const topOther = await Score.findOne({ status: 'valid', isGuest: { $ne: true }, userId: { $ne: player._id } })
      .sort({ score: -1 })
      .select('score')
      .lean();
    const baseline = topOther?.score ?? 0;
    const prevMax = process.env.ANTICHEAT_MAX_SCORE;
    process.env.ANTICHEAT_MAX_SCORE = '1000000'; // nới trần để outlier không bị chặn thành impossible
    const outScore = baseline * 2 + 5;
    const r = await evaluateScore({
      score: outScore,
      durationMs: outScore * 500, // đủ dài để không bị too_fast
      userId: player._id,
      isGuest: false,
      priorPersonalBest: 0,
      gamesPlayed: 0, // tránh pb_spike
    });
    process.env.ANTICHEAT_MAX_SCORE = prevMax;
    check(
      `điểm ${outScore} (baseline ${baseline}) → flagged + cờ global_outlier`,
      r.status === 'flagged' && r.flags.includes('global_outlier'),
      JSON.stringify(r)
    );
  }

  // 7) Khách (guest): KHÔNG bị pb_spike/outlier (được bỏ qua), chỉ còn luật thời lượng.
  {
    const r = await evaluateScore({
      score: 500,
      durationMs: 500 * 400,
      userId: player._id,
      isGuest: true,
      priorPersonalBest: 10,
      gamesPlayed: 100,
    });
    check('khách điểm 500 (duration hợp lệ) → valid, không pb_spike/outlier', r.status === 'valid' && r.flags.length === 0, JSON.stringify(r));
  }

  console.log('\n[L1] Một session active mỗi người (chống tích trữ)');
  {
    const now = new Date();
    await GameSession.create({ userId: player._id, seed: 0, startedAt: now, expiresAt: new Date(now.getTime() + TTL_MS), submitted: false });
    await GameSession.create({ userId: player._id, seed: 0, startedAt: now, expiresAt: new Date(now.getTime() + TTL_MS), submitted: false });
    // Mô phỏng logic /start: vô hiệu session cũ chưa nộp rồi tạo session mới.
    const t0 = new Date();
    await GameSession.updateMany(
      { userId: player._id, submitted: false, expiresAt: { $gt: t0 } },
      { $set: { expiresAt: t0 } }
    );
    await GameSession.create({ userId: player._id, seed: 0, startedAt: t0, expiresAt: new Date(t0.getTime() + TTL_MS), submitted: false });
    const active = await GameSession.countDocuments({ userId: player._id, submitted: false, expiresAt: { $gt: new Date() } });
    check('sau start: đúng 1 session active', active === 1, `active=${active}`);
  }

  console.log('\n[L1] Băm IP (ẩn danh, ổn định)');
  {
    const reqA = { headers: { 'x-forwarded-for': '8.8.8.8' }, ip: '8.8.8.8' } as unknown as Request;
    const reqA2 = { headers: { 'x-forwarded-for': '8.8.8.8, 10.0.0.1' }, ip: '10.0.0.1' } as unknown as Request;
    const reqB = { headers: {}, ip: '9.9.9.9' } as unknown as Request;
    const hA = hashIp(reqA);
    const hA2 = hashIp(reqA2);
    const hB = hashIp(reqB);
    check('hash IP dài 16 hex', /^[0-9a-f]{16}$/.test(hA), hA);
    check('cùng IP (kể cả qua XFF) → cùng hash', hA === hA2, `${hA} vs ${hA2}`);
    check('IP khác → hash khác', hA !== hB, `${hA} vs ${hB}`);
  }

  // Dọn sạch.
  const removedAfter = await cleanup();
  console.log(`\nĐã dọn ${removedAfter} user test (@${DOMAIN}).`);

  console.log(`\n===== KẾT QUẢ: ${passed} PASS, ${failed} FAIL =====`);
  await mongoose.disconnect();
  if (failed > 0) process.exit(1);
}

main().catch(async (e) => {
  console.error(e);
  try {
    await cleanup();
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
