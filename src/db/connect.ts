import mongoose from 'mongoose';

let conn: typeof mongoose | null = null;
let promise: Promise<typeof mongoose> | null = null;

export async function connectDB(): Promise<typeof mongoose> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI chưa được cấu hình trong .env');
  if (conn) return conn;
  if (!promise) promise = mongoose.connect(uri, { bufferCommands: false });
  conn = await promise;
  return conn;
}
