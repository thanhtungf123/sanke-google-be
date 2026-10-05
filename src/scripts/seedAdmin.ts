import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../db/connect.js';
import { User } from '../db/models/User.js';

// Phong quyền admin cho tài khoản có email = ADMIN_EMAIL.
// Chạy 1 lần: npm run seed:admin  (cần ADMIN_EMAIL trong backend/.env)
async function main() {
  const email = (process.env.ADMIN_EMAIL || process.argv[2] || '').toLowerCase().trim();
  if (!email) {
    console.error('Thiếu ADMIN_EMAIL. Thêm vào backend/.env hoặc truyền: npm run seed:admin -- you@example.com');
    process.exit(1);
  }
  await connectDB();
  const user = await User.findOne({ email, isGuest: false });
  if (!user) {
    console.error(`Không tìm thấy tài khoản với email "${email}". Hãy đăng ký tài khoản này trước.`);
    process.exit(1);
  }
  if (user.role === 'admin') {
    console.log(`"${user.nickname}" (${email}) đã là admin rồi.`);
  } else {
    user.role = 'admin';
    await user.save();
    console.log(`Đã phong admin cho "${user.nickname}" (${email}).`);
  }
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
