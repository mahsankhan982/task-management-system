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

/**
 * Routes a Team Member may write to without owning anything in particular:
 * discussion, their own notification state, and attachments (the attachments
 * route runs its own assigned-task check).
 */
const teamMemberOpenPrefixes = ["/api/comments", "/api/notifications", "/api/attachments"];

/**
 * Task-scoped writes a Team Member is allowed to attempt. These are not waved
 * through: the route handlers behind them enforce per-task ownership with
 * `checkTaskEditAccess`, so a Team Member only ever changes tasks they created
 * (plus the status flow on tasks assigned to them).
 */
function isTeamMemberTaskWrite(method: string, rawPath: string) {
  const path = rawPath.length > 1 ? rawPath.replace(/\/+$/, "") : rawPath;

  // Create a task, and assign it to whoever should work on it.
  if (path === "/api/tasks" && method === "POST") {
    return true;
  }

  // Move an assigned task along its status flow.
  if (method === "PATCH" && /^\/api\/tasks\/\d+\/status$/.test(path)) {
    return true;
  }

  // Edit / delete an owned task, and its assignees and labels.
  if (/^\/api\/tasks\/\d+(\/(assignees|labels))?$/.test(path)) {
    return true;
  }

  // Checklist items belong to a task and inherit that task's ownership.
  if (path === "/api/checklist" || /^\/api\/checklist\/\d+$/.test(path)) {
    return true;
  }

  return false;
}

export function preventTeamMemberWrites(req: Request, res: Response, next: NextFunction) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    return next();
  }

  if (teamMemberOpenPrefixes.some((prefix) => req.path.startsWith(prefix))) {
    return next();
  }

  if (req.user?.role !== "Team Member") {
    return next();
  }

  if (isTeamMemberTaskWrite(req.method, req.path)) {
    return next();
  }

  return res.status(403).json({
    success: false,
    message:
      "Team Members can create and manage their own tasks, comment, and update tasks assigned to them. Boards, lists, teams and users are managed by Team Leads and above.",
  });
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
