import express from "express";
import cors from "cors";

import { env } from "./config/env";
import authRouter from "./routes/auth";
import teamsRouter from "./routes/teams";
import usersRouter from "./routes/users";
import boardsRouter from "./routes/boards";
import tasksRouter from "./routes/tasks";
import commentsRouter from "./routes/comments";
import workflowRouter from "./routes/workflow";
import labelsRouter from "./routes/labels";
import checklistRouter from "./routes/checklist";
import activityRouter from "./routes/activity";
import notificationsRouter from "./routes/notifications";
import {
  preventTeamMemberWrites,
  requireAuth,
  requireManagerWrites,
} from "./middleware/auth";

const app = express();

app.disable("x-powered-by");

app.use(cors({ origin: env.CLIENT_URL, credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "Task Management API is running",
    environment: env.NODE_ENV,
  });
});

app.get("/", (_req, res) => {
  res.status(200).json({ success: true, message: "Welcome to Task Management API" });
});

app.use("/api/auth", authRouter);

app.use(requireAuth);
app.use(preventTeamMemberWrites);

app.use("/api/teams", requireManagerWrites, teamsRouter);
app.use("/api/users", requireManagerWrites, usersRouter);
app.use("/api/boards", boardsRouter);
app.use("/api/tasks", tasksRouter);
app.use("/api/comments", commentsRouter);
app.use("/api/workflow", workflowRouter);
app.use("/api/labels", labelsRouter);
app.use("/api/checklist", checklistRouter);
app.use("/api/activity", activityRouter);
app.use("/api/notifications", notificationsRouter);

export default app;
