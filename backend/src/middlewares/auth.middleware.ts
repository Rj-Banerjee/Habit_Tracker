import { Request, Response, NextFunction } from 'express';
import { supabase } from '../services/supabase.service';
import { prisma } from '../models/prisma';
import { AppError } from './error.middleware';

export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError('Unauthorized: Missing or malformed authorization header', 401);
    }

    const token = authHeader.split(' ')[1];

    // Verify token using Supabase Auth
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      throw new AppError('Unauthorized: Invalid or expired session token', 401);
    }

    // Ensure user exists in our local PostgreSQL Users table. A dashboard load sends
    // parallel requests, so this has to tolerate another request creating the row first.
    const email = user.email ?? '';
    await prisma.users.createMany({
      data: [{ id: user.id, email }],
      skipDuplicates: true,
    });

    req.user = { id: user.id, email };

    next();
  } catch (error) {
    next(error);
  }
};
