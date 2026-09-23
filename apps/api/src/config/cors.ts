import { env } from "./env";

export const allowedOrigins = [...new Set([
  ...env.CLIENT_URL.split(",").map(value => value.trim().replace(/\/$/, "")),
  "https://web-two-peach-98.vercel.app",
].filter(Boolean))];
