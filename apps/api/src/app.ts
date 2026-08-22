import express, { type NextFunction, type Request, type Response } from "express";
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
import attachmentsRouter from "./routes/attachments";
import {
  preventTeamMemberWrites,
  requireAuth,
  requireManagerWrites,
} from "./middleware/auth";

const DEFAULT_BODY_LIMIT = "1mb";
const COMMENT_BODY_LIMIT = "2mb";

const app = express();

app.disable("x-powered-by");

app.use(cors({ origin: env.CLIENT_URL, credentials: true }));

// Comments can carry long write-ups, so they get a larger body budget than
// the rest of the API. This parser has to run before the global 1mb one:
// once it has parsed the body, body-parser marks the request and the global
// parser below skips it instead of rejecting the payload as too large.
app.use("/api/comments", express.json({ limit: COMMENT_BODY_LIMIT }));
app.use(express.json({ limit: DEFAULT_BODY_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: DEFAULT_BODY_LIMIT }));

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
app.use("/api/attachments", attachmentsRouter);

// body-parser rejects oversized payloads with an HTML error page by default,
// which the client surfaces as a bare status code. Answer in JSON instead so
// the UI can show why the request was refused.
app.use((error: any, req: Request, res: Response, next: NextFunction) => {
  if (error?.type === "entity.too.large") {
    const limit = req.path.startsWith("/api/comments")
      ? COMMENT_BODY_LIMIT
      : DEFAULT_BODY_LIMIT;

    return res.status(413).json({
      success: false,
      message: `That content is too large. The limit is ${limit.toUpperCase()}.`,
    });
  }

  return next(error);
});

export default app;
