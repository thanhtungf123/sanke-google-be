import type { Request, Response, NextFunction, RequestHandler } from 'express';

// Bọc handler async để lỗi được chuyển tới error middleware.
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
