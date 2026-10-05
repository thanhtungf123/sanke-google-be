import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../db/connect.js';
import { User } from '../db/models/User.js';
import { Score } from '../db/models/Score.js';
import { GameSession } from '../db/models/GameSession.js';

// Xoá dữ liệu test (tài khoản TungTester + điểm + phiên chơi của nó).
// Chạy: npm run clean:testdata        -> xem trước (dry-run)
//       npm run clean:testdata -- --yes -> xoá thật
const TEST_EMAILS = ['test1@example.com'];
const TEST_NICKNAMES = ['TungTester'];

async function main() {
  const confirmed = process.argv.includes('--yes');
  await connectDB();

  const users = await User.find({
    $or: [
      { email: { $in: TEST_EMAILS.map((e) => e.toLowerCase()) } },
      { nicknameLower: { $in: TEST_NICKNAMES.map((n) => n.toLowerCase()) } },
    ],
  }).lean();

  if (users.length === 0) {
    console.log('Không tìm thấy tài khoản test nào. Không có gì để xoá.');
    await mongoose.disconnect();
    process.exit(0);
  }

  const ids = users.map((u) => u._id);
  const scoreCount = await Score.countDocuments({ userId: { $in: ids } });
  const sessionCount = await GameSession.countDocuments({ userId: { $in: ids } });

  console.log('Sẽ xoá:');
  for (const u of users) console.log(`  - user: ${u.nickname} (${u.email ?? 'guest'})`);
  console.log(`  - scores: ${scoreCount}`);
  console.log(`  - gameSessions: ${sessionCount}`);

  if (!confirmed) {
    console.log('\nĐây là xem trước (dry-run). Chạy lại với: npm run clean:testdata -- --yes để xoá thật.');
    await mongoose.disconnect();
    process.exit(0);
  }

  await Score.deleteMany({ userId: { $in: ids } });
  await GameSession.deleteMany({ userId: { $in: ids } });
  await User.deleteMany({ _id: { $in: ids } });
  console.log('\nĐã xoá xong dữ liệu test.');
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
