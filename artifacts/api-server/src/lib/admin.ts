import type { Request, Response, NextFunction } from "express";

export const ADMIN_COOKIE_NAME = "admin";
export const ADMIN_COOKIE_MAX_AGE = 24 * 60 * 60 * 1000; // 1 day

export function getAdminPassword(): string {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    throw new Error("ADMIN_PASSWORD environment variable is required for admin mode.");
  }
  return password;
}

export function isAdminRequest(req: Request): boolean {
  return req.signedCookies?.[ADMIN_COOKIE_NAME] === "1";
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (isAdminRequest(req)) {
    next();
    return;
  }
  res.status(401).json({ error: "Admin credentials required" });
}

export function signAdminCookie(res: Response): void {
  res.cookie(ADMIN_COOKIE_NAME, "1", {
    httpOnly: true,
    signed: true,
    sameSite: "none",
    secure: true,
    maxAge: ADMIN_COOKIE_MAX_AGE,
    path: "/",
  });
}

export function clearAdminCookie(res: Response): void {
  res.clearCookie(ADMIN_COOKIE_NAME, {
    httpOnly: true,
    signed: true,
    sameSite: "none",
    secure: true,
    path: "/",
  });
}
