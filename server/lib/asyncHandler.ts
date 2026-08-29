import type { NextFunction, Request, RequestHandler, Response } from "express";

/**
 * Wraps an async Express route handler so a rejected promise is forwarded to
 * `next()` instead of becoming an unhandled rejection. Express 4 does not do
 * this automatically for async handlers.
 */
export function wrap(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void>
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}
