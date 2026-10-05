import 'dotenv/config';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import mongoose from 'mongoose';
import { EJSON } from 'bson';
import { connectDB } from '../db/connect.js';

// Sao lưu toàn bộ database ra 1 file JSON (không cần cài mongodump).
// Chạy: npm run backup:db              -> ghi vào backend/backups/backup-<timestamp>.json
//       npm run backup:db -- ./x.json  -> ghi vào đường dẫn tuỳ ý
//
// Khôi phục: npm run restore:db -- <file.json>   (xem restoreDb.ts)
// File dùng Extended JSON (EJSON) nên giữ đúng kiểu ObjectId/Date khi khôi phục.
async function main() {
  await connectDB();
  const db = mongoose.connection.db;
  if (!db) throw new Error('Không lấy được handle database');

  const collections = await db.listCollections().toArray();
  const dump: Record<string, unknown[]> = {};
  let totalDocs = 0;

  for (const { name } of collections) {
    if (name.startsWith('system.')) continue;
    const docs = await db.collection(name).find({}).toArray();
    dump[name] = docs;
    totalDocs += docs.length;
    console.log(`  - ${name}: ${docs.length} document`);
  }

  const payload = {
    meta: {
      database: db.databaseName,
      createdAt: new Date().toISOString(),
      collections: Object.keys(dump),
      totalDocs,
    },
    data: dump,
  };

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const argPath = process.argv[2];
  const outPath = argPath
    ? resolve(process.cwd(), argPath)
    : resolve(process.cwd(), 'backups', `backup-${stamp}.json`);

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, EJSON.stringify(payload, undefined, 2, { relaxed: false }), 'utf8');

  console.log(
    `\nĐã sao lưu ${totalDocs} document (${Object.keys(dump).length} collection) → ${outPath}`
  );
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
