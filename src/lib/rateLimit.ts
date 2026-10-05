import type { Request } from 'express';
import { connectDB } from '../db/connect.js';
import { RateLimit } from '../db/models/RateLimit.js';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
}

export async function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<RateLimitResult> {
  await connectDB();
  const windowStart = Math.floor(Date.now() / windowMs) * windowMs;
  const id = `${key}:${windowStart}`;

  const doc = await RateLimit.findByIdAndUpdate(
    id,
    { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date(windowStart + windowMs) } },
    { upsert: true, new: true }
  ).lean();

  const count = doc?.count ?? 1;
  return { allowed: count <= limit, remaining: Math.max(0, limit - count) };
}

export function getClientIp(req: Request): string {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff) return xff.split(',')[0].trim();
  return req.ip ?? 'unknown';
}
