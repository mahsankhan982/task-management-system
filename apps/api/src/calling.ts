import type { Server, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { env } from "./config/env";
import { db } from "./db/pool";

type CallUser = { id: number; email: string; role: string; team_id: number | null };

type AuthenticatedSocket = Socket & { user?: CallUser };

export function registerCalling(io: Server) {
  io.use(async (socket: AuthenticatedSocket, next) => {
    try {
      const token = String(socket.handshake.auth?.token || "");
      if (!token || !env.JWT_SECRET) return next(new Error("Authentication required"));
      const payload = jwt.verify(token, env.JWT_SECRET) as { id: number };
      const result = await db.query(
        "SELECT id, email, role, team_id, is_active FROM users WHERE id = $1 LIMIT 1",
        [payload.id]
      );
      const user = result.rows[0];
      if (!user || !user.is_active) return next(new Error("User account is not active"));
      socket.user = { id: Number(user.id), email: user.email, role: user.role, team_id: user.team_id === null ? null : Number(user.team_id) };
      next();
    } catch {
      next(new Error("Invalid or expired authentication token"));
    }
  });

  io.on("connection", (socket: AuthenticatedSocket) => {
    const user = socket.user!;
    socket.join(`user:${user.id}`);
    socket.emit("call:ready", { userId: user.id });

    socket.on("call:invite", (data) => {
      const targetUserId = Number(data?.targetUserId);
      if (!targetUserId || targetUserId === user.id) return;
      io.to(`user:${targetUserId}`).emit("call:incoming", {
        callId: String(data?.callId || `${user.id}-${Date.now()}`),
        callerId: user.id,
        callerEmail: user.email,
        callerRole: user.role,
        type: data?.type === "audio" ? "audio" : "video",
      });
    });

    socket.on("call:accept", (data) => {
      const callerId = Number(data?.callerId);
      if (callerId) io.to(`user:${callerId}`).emit("call:accepted", { callId: data?.callId, userId: user.id });
    });

    socket.on("call:reject", (data) => {
      const callerId = Number(data?.callerId);
      if (callerId) io.to(`user:${callerId}`).emit("call:rejected", { callId: data?.callId, userId: user.id });
    });

    socket.on("call:end", (data) => {
      const targetUserId = Number(data?.targetUserId);
      if (targetUserId) io.to(`user:${targetUserId}`).emit("call:ended", { callId: data?.callId, userId: user.id });
    });

    socket.on("webrtc:offer", (data) => {
      const targetUserId = Number(data?.targetUserId);
      if (targetUserId) io.to(`user:${targetUserId}`).emit("webrtc:offer", { ...data, fromUserId: user.id });
    });

    socket.on("webrtc:answer", (data) => {
      const targetUserId = Number(data?.targetUserId);
      if (targetUserId) io.to(`user:${targetUserId}`).emit("webrtc:answer", { ...data, fromUserId: user.id });
    });

    socket.on("webrtc:ice-candidate", (data) => {
      const targetUserId = Number(data?.targetUserId);
      if (targetUserId) io.to(`user:${targetUserId}`).emit("webrtc:ice-candidate", { ...data, fromUserId: user.id });
    });

    socket.on("call:mute", (data) => {
      const targetUserId = Number(data?.targetUserId);
      if (targetUserId) io.to(`user:${targetUserId}`).emit("call:mute", { muted: Boolean(data?.muted), userId: user.id });
    });

    socket.on("call:camera", (data) => {
      const targetUserId = Number(data?.targetUserId);
      if (targetUserId) io.to(`user:${targetUserId}`).emit("call:camera", { enabled: Boolean(data?.enabled), userId: user.id });
    });

    socket.on("call:screen-share", (data) => {
      const targetUserId = Number(data?.targetUserId);
      if (targetUserId) io.to(`user:${targetUserId}`).emit("call:screen-share", { sharing: Boolean(data?.sharing), userId: user.id });
    });

    socket.on("disconnect", () => {
      // Socket.IO automatically removes the user room.
    });
  });
}