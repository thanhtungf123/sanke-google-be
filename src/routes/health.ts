import { Router } from 'express';
import mongoose from 'mongoose';
import { connectDB } from '../db/connect.js';
import { User } from '../db/models/User.js';
import { GameSession } from '../db/models/GameSession.js';
import { Score } from '../db/models/Score.js';
import { SeoContent } from '../db/models/SeoContent.js';
import { AuditLog } from '../db/models/AuditLog.js';
import { asyncHandler } from '../lib/asyncHandler.js';

export const healthRouter = Router();

healthRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const startedAt = Date.now();
    await connectDB();
    await mongoose.connection.db?.command({ ping: 1 });
    await Promise.all([
      User.syncIndexes(),
      GameSession.syncIndexes(),
      Score.syncIndexes(),
      SeoContent.syncIndexes(),
      AuditLog.syncIndexes(),
    ]);
    const collections = (await mongoose.connection.db!.listCollections().toArray()).map(
      (c) => c.name
    );
    res.json({
      ok: true,
      database: mongoose.connection.name,
      readyState: mongoose.connection.readyState,
      collections,
      counts: {
        users: await User.estimatedDocumentCount(),
        scores: await Score.estimatedDocumentCount(),
      },
      tookMs: Date.now() - startedAt,
    });
  })
);
