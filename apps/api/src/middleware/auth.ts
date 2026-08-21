import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { db } from "../db/pool";

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

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authorization = req.headers.authorization;

  if (!authorization || !authorization.startsWith("Bearer ")) {
    return res.status(401).json({ success: false, message: "Authentication required" });
  }

  if (!env.JWT_SECRET) {
    console.error("JWT_SECRET is not configured");
    return res.status(500).json({ success: false, message: "Server authentication configuration error" });
  }

  const token = authorization.slice(7);

  let payload: AuthUser;

  try {
    payload = jwt.verify(token, env.JWT_SECRET) as AuthUser;
  } catch {
    return res.status(401).json({ success: false, message: "Invalid or expired token" });
  }

  try {
    const result = await db.query(
      "SELECT id, email, role, team_id, is_active FROM users WHERE id = $1 LIMIT 1",
      [payload.id]
    );

    const user = result.rows[0];

    if (!user || !user.is_active) {
      return res.status(401).json({ success: false, message: "User account is not active" });
    }

    req.user = {
      id: Number(user.id),
      email: user.email,
      role: user.role as UserRole,
      team_id: user.team_id === null ? null : Number(user.team_id),
    };

    return next();
  } catch (error) {
    console.error("Authentication database check failed:", error);
    return res.status(500).json({ success: false, message: "Unable to validate session" });
  }
}

export function preventTeamMemberWrites(req: Request, res: Response, next: NextFunction) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    return next();
  }

  if (req.path.startsWith("/api/comments")) {
    return next();
  }

  if (req.path.startsWith("/api/notifications")) {
    return next();
  }

  if (
    req.user?.role === "Team Member" &&
    req.method === "PATCH" &&
    /^\/api\/tasks\/\d+\/status$/.test(req.path)
  ) {
    return next();
  }

  if (req.user?.role === "Team Member") {
    return res.status(403).json({
      success: false,
      message: "Team Members have read-only access except for comments and their assigned task status",
    });
  }

  return next();
}

export function requireManagerWrites(req: Request, res: Response, next: NextFunction) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    return next();
  }

  if (req.user?.role !== "Manager") {
    return res.status(403).json({
      success: false,
      message: "Only Managers can manage teams and users",
    });
  }

  return next();
}
