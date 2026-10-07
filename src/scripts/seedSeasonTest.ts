import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../db/connect.js';
import { User } from '../db/models/User.js';
import { Score } from '../db/models/Score.js';
import { Notification } from '../db/models/Notification.js';
import { hashPassword } from '../lib/password.js';
import { monthRangeICT } from '../lib/time.js';

// Script tạo dữ liệu TEST cho tính năng Mùa giải (V3).
// - 10 người chơi, có điểm ở các tháng 2026-04 .. 2026-08.
// - 1 ca điểm BẤT THƯỜNG (valid, rất cao, thời lượng ngắn) nằm trong top tháng 7
//   để test: admin thấy điểm lạ -> loại -> người dưới được đẩy lên.
// Chạy lại được: xoá sạch user @snake.test cũ rồi tạo lại.
//
// Dùng:  npx tsx src/scripts/seedSeasonTest.ts
//        npx tsx src/scripts/seedSeasonTest.ts --clean   (chỉ xoá, không tạo)

const DOMAIN = 'snake.test';
const PASSWORD = 'snake1234';
const MONTHS = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08'];

interface PlayerDef {
  email: string;
  nickname: string;
  scores: Record<string, number>; // monthKey -> điểm (best "bình thường")
}

// 10 người chơi + điểm mỗi tháng (thứ tự tháng: 04,05,06,07,08).
const PLAYERS: PlayerDef[] = [
  { email: `player01@${DOMAIN}`, nickname: 'CobraKai', scores: pm(58, 49, 45, 54, 62) },
  { email: `player02@${DOMAIN}`, nickname: 'Mamba', scores: pm(52, 63, 39, 48, 55) },
  { email: `player03@${DOMAIN}`, nickname: 'Viper', scores: pm(47, 51, 66, 43, 49) },
  { email: `player04@${DOMAIN}`, nickname: 'PythonPro', scores: pm(61, 40, 58, 52, 44) },
  { email: `player05@${DOMAIN}`, nickname: 'Anaconda', scores: pm(33, 57, 42, 24, 58) }, // 24 = điểm thường tháng 7
  { email: `player06@${DOMAIN}`, nickname: 'SlitherQueen', scores: pm(44, 46, 61, 59, 40) },
  { email: `player07@${DOMAIN}`, nickname: 'NoodleDragon', scores: pm(29, 60, 37, 46, 53) },
  { email: `player08@${DOMAIN}`, nickname: 'HissBoss', scores: pm(55, 35, 50, 51, 47) },
  { email: `player09@${DOMAIN}`, nickname: 'FangZilla', scores: pm(38, 53, 48, 40, 60) },
  { email: `player10@${DOMAIN}`, nickname: 'GardenSnek', scores: pm(41, 44, 54, 57, 51) },
];

// Ca bất thường: Anaconda (player05) có thêm 1 điểm 480 (valid) ở tháng 7, thời lượng ngắn.
const ABNORMAL = { email: `player05@${DOMAIN}`, month: '2026-07', score: 480, durationMs: 1500 };

function pm(apr: number, may: number, jun: number, jul: number, aug: number): Record<string, number> {
  return { '2026-04': apr, '2026-05': may, '2026-06': jun, '2026-07': jul, '2026-08': aug };
}

// Thời điểm giữa tháng (ICT) để chắc chắn nằm trong khoảng tháng.
function midMonth(monthKey: string): Date {
  const { start } = monthRangeICT(monthKey);
  return new Date(start.getTime() + 15 * 86_400_000);
}

async function cleanup(): Promise<number> {
  const users = await User.find({ email: { $regex: `@${DOMAIN}$` } }).select('_id').lean();
  const ids = users.map((u) => u._id);
  await Promise.all([
    Score.deleteMany({ userId: { $in: ids } }),
    Notification.deleteMany({ userId: { $in: ids } }),
    User.deleteMany({ _id: { $in: ids } }),
  ]);
  return ids.length;
}

async function insertScore(
  userId: mongoose.Types.ObjectId,
  nickname: string,
  score: number,
  when: Date,
  durationMs: number
): Promise<void> {
  await Score.collection.insertOne({
    userId,
    nickname,
    isGuest: false,
    score,
    startedAt: new Date(when.getTime() - durationMs),
    endedAt: when,
    durationMs,
    source: 'google',
    gameVersion: 'current',
    status: 'valid',
    clientMeta: { ua: 'seed-script' },
    createdAt: when,
    updatedAt: when,
  });
}

async function main(): Promise<void> {
  const cleanOnly = process.argv.includes('--clean');
  await connectDB();

  const removed = await cleanup();
  console.log(`Đã xoá ${removed} user test cũ (@${DOMAIN}).`);
  if (cleanOnly) {
    await mongoose.disconnect();
    return;
  }

  const passwordHash = await hashPassword(PASSWORD);

  for (const p of PLAYERS) {
    const emailLower = p.email.toLowerCase();
    const user = await User.create({
      isGuest: false,
      email: emailLower,
      passwordHash,
      nickname: p.nickname,
      nicknameLower: p.nickname.toLowerCase(),
      role: 'user',
      status: 'active',
    });

    const allScores: number[] = [];
    for (const m of MONTHS) {
      const s = p.scores[m];
      // Thời lượng "hợp lệ" (>= score*250ms) để trông bình thường.
      await insertScore(user._id, p.nickname, s, midMonth(m), s * 400);
      allScores.push(s);
    }

    // Ca bất thường.
    if (p.email === ABNORMAL.email) {
      const when = new Date(midMonth(ABNORMAL.month).getTime() + 2 * 86_400_000);
      await insertScore(user._id, p.nickname, ABNORMAL.score, when, ABNORMAL.durationMs);
      allScores.push(ABNORMAL.score);
    }

    user.personalBest = Math.max(...allScores);
    user.gamesPlayed = allScores.length;
    await user.save();
  }

  console.log('\n===== TẠO XONG 10 TÀI KHOẢN TEST =====');
  console.log(`Mật khẩu CHUNG cho tất cả: ${PASSWORD}`);
  console.log('Đăng nhập bằng EMAIL bên dưới.\n');
  const header = ['Email', 'Nickname', 'T4', 'T5', 'T6', 'T7', 'T8'];
  console.log(header.join(' | '));
  for (const p of PLAYERS) {
    const row = [
      p.email,
      p.nickname,
      ...MONTHS.map((m) => {
        if (p.email === ABNORMAL.email && m === ABNORMAL.month)
          return `${ABNORMAL.score}(⚠)+${p.scores[m]}`;
        return String(p.scores[m]);
      }),
    ];
    console.log(row.join(' | '));
  }
  console.log(
    `\n⚠ Điểm bất thường: ${ABNORMAL.email} có điểm ${ABNORMAL.score} ở ${ABNORMAL.month} ` +
      `(thời lượng ${ABNORMAL.durationMs}ms) — status 'valid', đang đứng #1 tháng 7. ` +
      `Vào Admin > Điểm để LOẠI điểm này, rồi xem lại Top 7 sẽ thấy người dưới được đẩy lên.`
  );

  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error(e);
  try {
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
