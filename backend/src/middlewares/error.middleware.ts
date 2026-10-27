import { Request, Response, NextFunction } from 'express';

export class AppError extends Error {
  public statusCode: number;
  public isOperational: boolean;

  constructor(message: string, statusCode: number = 500, isOperational: boolean = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }
}

export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
) => {
  let statusCode = 500;
  let message = 'Internal Server Error';

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;
  } else if ('code' in err && typeof (err as any).code === 'string') {
    // Prisma known error codes
    const prismaErr = err as any;
    if (prismaErr.code === 'P2002') {
      statusCode = 409;
      message = 'A resource with this key already exists.';
    } else if (prismaErr.code === 'P2025') {
      statusCode = 404;
      message = 'Resource not found.';
    }
  }

  if (process.env.NODE_ENV === 'development') {
    console.error('💥 [Error]:', err);
    return res.status(statusCode).json({
      status: 'error',
      statusCode,
      message,
      stack: err.stack,
    });
  }

  return res.status(statusCode).json({
    status: 'error',
    statusCode,
    message,
  });
};
