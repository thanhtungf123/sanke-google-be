import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import mongoose from 'mongoose';
import { EJSON } from 'bson';
import { connectDB } from '../db/connect.js';

// Khôi phục database từ file sao lưu do backup:db tạo ra.
// Chạy (xem trước):     npm run restore:db -- <file.json>
//     (ghi đè thật):    npm run restore:db -- <file.json> --yes
//
// MẶC ĐỊNH là chế độ "merge" (upsert theo _id, không xoá dữ liệu đang có).
// Thêm --drop để XOÁ SẠCH từng collection trước khi nạp lại (khôi phục nguyên trạng).
async function main() {
  const file = process.argv.find((a) => a.endsWith('.json'));
  const confirmed = process.argv.includes('--yes');
  const drop = process.argv.includes('--drop');

  if (!file) {
    console.error('Thiếu đường dẫn file. Ví dụ: npm run restore:db -- backups/backup-....json');
    process.exit(1);
  }

  const raw = readFileSync(resolve(process.cwd(), file), 'utf8');
  const parsed = EJSON.parse(raw) as {
    meta?: { database?: string; createdAt?: string; totalDocs?: number };
    data: Record<string, Record<string, unknown>[]>;
  };
  const data = parsed.data;
  if (!data || typeof data !== 'object') throw new Error('File sao lưu không hợp lệ (thiếu "data")');

  console.log(`File: ${file}`);
  if (parsed.meta) console.log(`  tạo lúc: ${parsed.meta.createdAt} — db gốc: ${parsed.meta.database}`);
  console.log(`  chế độ: ${drop ? 'DROP + nạp lại (ghi đè sạch)' : 'merge (upsert theo _id)'}`);
  for (const [name, docs] of Object.entries(data)) console.log(`  - ${name}: ${docs.length} document`);

  if (!confirmed) {
    console.log('\nĐây là xem trước (dry-run). Chạy lại kèm --yes để khôi phục thật.');
    process.exit(0);
  }

  await connectDB();
  const db = mongoose.connection.db;
  if (!db) throw new Error('Không lấy được handle database');

  for (const [name, docs] of Object.entries(data)) {
    const col = db.collection(name);
    if (drop) {
      await col.deleteMany({});
    }
    if (docs.length === 0) continue;
    // Upsert theo _id để chạy lại được nhiều lần mà không nhân bản.
    const ops = docs.map((doc) => ({
      replaceOne: {
        filter: { _id: (doc as { _id: unknown })._id } as Record<string, unknown>,
        replacement: doc,
        upsert: true,
      },
    }));
    const res = await col.bulkWrite(ops as Parameters<typeof col.bulkWrite>[0], {
      ordered: false,
    });
    console.log(`  - ${name}: upsert ${res.upsertedCount}, thay thế ${res.modifiedCount}`);
  }

  console.log('\nĐã khôi phục xong.');
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
