import express from "express";
import cors from "cors";

import { env } from "./config/env";

const app = express();

app.disable("x-powered-by");

app.use(
  cors({
    origin: env.CLIENT_URL,
    credentials: true,
  })
);

app.use(express.json());

app.use(
  express.urlencoded({
    extended: true,
  })
);

app.get("/api/health", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "Task Management API is running",
    environment: env.NODE_ENV,
  });
});

app.get("/", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "Welcome to Task Management API",
  });
});

export default app;