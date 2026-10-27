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

    // Development bypass option for local testing if configured
    if (process.env.NODE_ENV === 'development' && token === 'dev-mock-token') {
      const demoEmail = 'demo@habittracker.com';
      const demoUser = await prisma.users.upsert({
        where: { email: demoEmail },
        update: {},
        create: {
          id: '00000000-0000-0000-0000-000000000001',
          email: demoEmail,
        },
      });
      req.user = { id: demoUser.id, email: demoUser.email };
      return next();
    }

    // Verify token using Supabase Auth
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      throw new AppError('Unauthorized: Invalid or expired session token', 401);
    }

    // Ensure user exists in our local PostgreSQL Users table
    const dbUser = await prisma.users.upsert({
      where: { id: user.id },
      update: { email: user.email ?? '' },
      create: {
        id: user.id,
        email: user.email ?? '',
      },
    });

    req.user = {
      id: dbUser.id,
      email: dbUser.email,
    };

    next();
  } catch (error) {
    next(error);
  }
};
