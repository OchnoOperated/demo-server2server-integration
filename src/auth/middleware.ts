import type { Request, Response, NextFunction } from 'express';
import { getAccessToken } from './tokenStore.js';

export async function requireAuth(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await getAccessToken();
    next();
  } catch {
    res.status(503).json({ error: 'Service not authenticated — check CLIENT_ID and CLIENT_SECRET' });
  }
}