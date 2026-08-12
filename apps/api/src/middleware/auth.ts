import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";

export type UserRole = "Manager" | "Coordinator" | "Team Lead" | "Team Member";

export interface AuthUser {
  id: number;
  email: string;
  role: UserRole;
  team_id: number | null;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authorization = req.headers.authorization;

  if (!authorization || !authorization.startsWith("Bearer ")) {
    return res.status(401).json({ success: false, message: "Authentication required" });
  }

  const token = authorization.slice(7);

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as AuthUser;
    req.user = payload;
    return next();
  } catch {
    return res.status(401).json({ success: false, message: "Invalid or expired token" });
  }
}

export function preventTeamMemberWrites(req: Request, res: Response, next: NextFunction) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    return next();
  }

  if (req.path.startsWith("/api/comments")) {
    return next();
  }

  if (req.user?.role === "Team Member") {
    return res.status(403).json({
      success: false,
      message: "Team Members have read-only access except for comments",
    });
  }

  return next();
}
