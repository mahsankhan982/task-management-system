$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

function Normalize-LF([string]$text) {
    return $text.Replace("`r`n", "`n").Replace("`r", "`n")
}

function Write-Utf8NoBom([string]$relativePath, [string]$content) {
    $fullPath = Join-Path $root $relativePath
    $parent = Split-Path -Parent $fullPath
    if ($parent -and -not (Test-Path $parent)) {
        New-Item -ItemType Directory -Force -Path $parent | Out-Null
    }
    $utf8 = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($fullPath, (Normalize-LF $content), $utf8)
}

function Replace-Exact([string]$relativePath, [string]$oldText, [string]$newText) {
    $fullPath = Join-Path $root $relativePath
    if (-not (Test-Path $fullPath)) {
        throw "File not found: $relativePath"
    }

    $text = Normalize-LF ([System.IO.File]::ReadAllText($fullPath))
    $old = Normalize-LF $oldText
    $new = Normalize-LF $newText

    if (-not $text.Contains($old)) {
        throw "Could not find expected code block in $relativePath. Stop here; no Git push yet."
    }

    $text = $text.Replace($old, $new)
    Write-Utf8NoBom $relativePath $text
}

if (-not (Test-Path "apps\web\src\app\page.tsx")) {
    throw "Run this script from the task-management-system project root."
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backup = Join-Path $root ".feature-backup-$timestamp"
New-Item -ItemType Directory -Force -Path $backup | Out-Null

$filesToBackup = @(
    "apps\api\src\config\env.ts",
    "apps\api\src\routes\auth.ts",
    "apps\api\.env.example",
    "apps\web\src\lib\api.ts",
    "apps\web\src\app\page.tsx",
    "apps\web\src\app\dashboard\page.tsx",
    "apps\web\src\app\dashboard\boards\page.tsx"
)

foreach ($file in $filesToBackup) {
    if (Test-Path $file) {
        $dest = Join-Path $backup $file
        $destParent = Split-Path -Parent $dest
        New-Item -ItemType Directory -Force -Path $destParent | Out-Null
        Copy-Item $file $dest -Force
    }
}

Write-Host "Backup created: $backup" -ForegroundColor Cyan

# ---------------------------------------------------------------------------
# Backend environment config
# ---------------------------------------------------------------------------
Write-Utf8NoBom "apps\api\src\config\env.ts" @'
import "dotenv/config";

export const env = {
  PORT: Number(process.env.PORT) || 5000,
  CLIENT_URL: process.env.CLIENT_URL || "http://localhost:3000",
  NODE_ENV: process.env.NODE_ENV || "development",
  JWT_SECRET: process.env.JWT_SECRET || "",

  DB_HOST: process.env.DB_HOST || "127.0.0.1",
  DB_PORT: Number(process.env.DB_PORT) || 5432,
  DB_USER: process.env.DB_USER || "task_app",
  DB_PASSWORD: process.env.DB_PASSWORD || "",
  DB_NAME: process.env.DB_NAME || "task_management",
  INSTANCE_UNIX_SOCKET: process.env.INSTANCE_UNIX_SOCKET || "",

  SMTP_HOST: process.env.SMTP_HOST || "",
  SMTP_PORT: Number(process.env.SMTP_PORT) || 465,
  SMTP_SECURE: process.env.SMTP_SECURE !== "false",
  SMTP_USER: process.env.SMTP_USER || "",
  SMTP_PASS: process.env.SMTP_PASS || "",
  SMTP_FROM: process.env.SMTP_FROM || process.env.SMTP_USER || "",
} as const;
'@

Write-Utf8NoBom "apps\api\.env.example" @'
PORT=5000
CLIENT_URL=http://localhost:3000
NODE_ENV=development

DB_HOST=127.0.0.1
DB_PORT=5432
DB_USER=task_app
DB_PASSWORD=change_me
DB_NAME=task_management
INSTANCE_UNIX_SOCKET=

JWT_SECRET=change_me_to_a_long_random_secret

# Password reset email (Gmail SMTP example)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=your-sender@gmail.com
SMTP_PASS=your_google_app_password
SMTP_FROM=Task Manager <your-sender@gmail.com>
'@

# ---------------------------------------------------------------------------
# Password reset DB migration
# ---------------------------------------------------------------------------
Write-Utf8NoBom "apps\api\src\db\migrations\004_password_reset_codes.sql" @'
CREATE TABLE IF NOT EXISTS password_reset_codes (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code_hash VARCHAR(64) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_codes_user_id
    ON password_reset_codes(user_id);

CREATE INDEX IF NOT EXISTS idx_password_reset_codes_expires_at
    ON password_reset_codes(expires_at);
'@

# ---------------------------------------------------------------------------
# Backend auth: login + 6-digit password reset
# ---------------------------------------------------------------------------
Write-Utf8NoBom "apps\api\src\routes\auth.ts" @'
import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt, { type JwtPayload } from "jsonwebtoken";
import nodemailer from "nodemailer";
import { createHash, randomInt } from "crypto";
import { db } from "../db/pool";
import { env } from "../config/env";
import { requireAuth } from "../middleware/auth";

const router = Router();

type ResetTokenPayload = JwtPayload & {
  id: number;
  reset_id: number;
  purpose: "password_reset";
};

function hashResetCode(code: string) {
  return createHash("sha256").update(code).digest("hex");
}

function mailer() {
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS || !env.SMTP_FROM) {
    throw new Error("Password reset email is not configured");
  }

  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
    },
  });
}

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: "Email and password are required" });
    }

    const result = await db.query(
      "SELECT id, full_name, email, password_hash, role, team_id, is_active FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1",
      [String(email).trim()]
    );

    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({ success: false, message: "Invalid email or password" });
    }

    if (!user.is_active) {
      return res.status(403).json({ success: false, message: "Account is inactive" });
    }

    const passwordMatches = await bcrypt.compare(String(password), user.password_hash);

    if (!passwordMatches) {
      return res.status(401).json({ success: false, message: "Invalid email or password" });
    }

    if (!env.JWT_SECRET) {
      throw new Error("JWT_SECRET is not configured");
    }

    const token = jwt.sign(
      {
        id: Number(user.id),
        email: user.email,
        role: user.role,
        team_id: user.team_id === null ? null : Number(user.team_id),
      },
      env.JWT_SECRET,
      { expiresIn: "8h" }
    );

    return res.status(200).json({
      success: true,
      token,
      user: {
        id: Number(user.id),
        full_name: user.full_name,
        email: user.email,
        role: user.role,
        team_id: user.team_id === null ? null : Number(user.team_id),
      },
    });
  } catch (error) {
    console.error("Login failed:", error);
    return res.status(500).json({ success: false, message: "Unable to login" });
  }
});

router.post("/forgot-password", async (req, res) => {
  try {
    const email = String(req.body?.email ?? "").trim();

    if (!email) {
      return res.status(400).json({ success: false, message: "Email is required" });
    }

    const userResult = await db.query(
      "SELECT id, full_name, email, is_active FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1",
      [email]
    );

    const user = userResult.rows[0];

    // Do not reveal whether an account exists.
    if (!user || !user.is_active) {
      return res.status(200).json({
        success: true,
        message: "If that email is registered, a verification code has been sent.",
      });
    }

    const code = String(randomInt(100000, 1000000));
    const codeHash = hashResetCode(code);

    await db.query(
      "DELETE FROM password_reset_codes WHERE user_id = $1 OR expires_at < NOW()",
      [user.id]
    );

    await db.query(
      `INSERT INTO password_reset_codes (user_id, code_hash, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '10 minutes')`,
      [user.id, codeHash]
    );

    await mailer().sendMail({
      from: env.SMTP_FROM,
      to: user.email,
      subject: "Task Manager password reset code",
      text: `Hello ${user.full_name}, your Task Manager verification code is ${code}. It expires in 10 minutes.`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:24px">
          <h2 style="margin:0 0 16px">Reset your Task Manager password</h2>
          <p>Hello ${user.full_name},</p>
          <p>Use this 6-digit verification code:</p>
          <div style="font-size:32px;font-weight:700;letter-spacing:8px;padding:18px 0">${code}</div>
          <p>This code expires in 10 minutes.</p>
          <p>If you did not request a password reset, you can ignore this email.</p>
        </div>
      `,
    });

    return res.status(200).json({
      success: true,
      message: "If that email is registered, a verification code has been sent.",
    });
  } catch (error) {
    console.error("Forgot password failed:", error);
    return res.status(500).json({ success: false, message: "Unable to send reset code" });
  }
});

router.post("/verify-reset-code", async (req, res) => {
  try {
    const email = String(req.body?.email ?? "").trim();
    const code = String(req.body?.code ?? "").trim();

    if (!email || !/^\d{6}$/.test(code)) {
      return res.status(400).json({ success: false, message: "Enter a valid 6-digit code" });
    }

    if (!env.JWT_SECRET) {
      throw new Error("JWT_SECRET is not configured");
    }

    const result = await db.query(
      `SELECT prc.id AS reset_id, u.id AS user_id
       FROM password_reset_codes prc
       JOIN users u ON u.id = prc.user_id
       WHERE LOWER(u.email) = LOWER($1)
         AND prc.code_hash = $2
         AND prc.expires_at > NOW()
         AND prc.verified_at IS NULL
       ORDER BY prc.created_at DESC
       LIMIT 1`,
      [email, hashResetCode(code)]
    );

    const row = result.rows[0];

    if (!row) {
      return res.status(400).json({ success: false, message: "Invalid or expired verification code" });
    }

    await db.query(
      "UPDATE password_reset_codes SET verified_at = NOW() WHERE id = $1",
      [row.reset_id]
    );

    const resetToken = jwt.sign(
      {
        id: Number(row.user_id),
        reset_id: Number(row.reset_id),
        purpose: "password_reset",
      },
      env.JWT_SECRET,
      { expiresIn: "10m" }
    );

    return res.status(200).json({
      success: true,
      reset_token: resetToken,
    });
  } catch (error) {
    console.error("Verify reset code failed:", error);
    return res.status(500).json({ success: false, message: "Unable to verify reset code" });
  }
});

router.post("/reset-password", async (req, res) => {
  try {
    const resetToken = String(req.body?.reset_token ?? "");
    const newPassword = String(req.body?.new_password ?? "");

    if (!resetToken) {
      return res.status(400).json({ success: false, message: "Reset session is missing" });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ success: false, message: "Password must be at least 8 characters" });
    }

    if (!env.JWT_SECRET) {
      throw new Error("JWT_SECRET is not configured");
    }

    const decoded = jwt.verify(resetToken, env.JWT_SECRET) as ResetTokenPayload;

    if (decoded.purpose !== "password_reset" || !decoded.id || !decoded.reset_id) {
      return res.status(400).json({ success: false, message: "Invalid reset session" });
    }

    const resetResult = await db.query(
      `SELECT id
       FROM password_reset_codes
       WHERE id = $1
         AND user_id = $2
         AND verified_at IS NOT NULL
         AND expires_at > NOW()
       LIMIT 1`,
      [decoded.reset_id, decoded.id]
    );

    if (!resetResult.rows[0]) {
      return res.status(400).json({ success: false, message: "Reset session has expired" });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    await db.query(
      "UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2",
      [passwordHash, decoded.id]
    );

    await db.query(
      "DELETE FROM password_reset_codes WHERE user_id = $1",
      [decoded.id]
    );

    return res.status(200).json({
      success: true,
      message: "Password changed successfully. You can now sign in.",
    });
  } catch (error) {
    console.error("Reset password failed:", error);

    if (error instanceof jwt.TokenExpiredError) {
      return res.status(400).json({ success: false, message: "Reset session has expired" });
    }

    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(400).json({ success: false, message: "Invalid reset session" });
    }

    return res.status(500).json({ success: false, message: "Unable to reset password" });
  }
});

router.get("/me", requireAuth, async (req, res) => {
  try {
    const result = await db.query(
      "SELECT id, full_name, email, role, team_id, is_active FROM users WHERE id = $1 LIMIT 1",
      [req.user!.id]
    );

    const user = result.rows[0];

    if (!user || !user.is_active) {
      return res.status(401).json({ success: false, message: "User not available" });
    }

    return res.status(200).json({ success: true, data: user });
  } catch (error) {
    console.error("Get current user failed:", error);
    return res.status(500).json({ success: false, message: "Unable to fetch user" });
  }
});

export default router;
'@

# ---------------------------------------------------------------------------
# Frontend API helpers
# ---------------------------------------------------------------------------
Write-Utf8NoBom "apps\web\src\lib\api.ts" @'
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";
const TOKEN_KEY = "task_management_token";

export function getAuthToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setAuthToken(token: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearAuthToken() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(TOKEN_KEY);
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers);
  const token = getAuthToken();

  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
    cache: "no-store",
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data?.message || `Request failed with status ${response.status}`);
  }

  return data as T;
}

export const api = {
  login: (email: string, password: string) =>
    apiRequest("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  requestPasswordReset: (email: string) =>
    apiRequest("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),

  verifyPasswordReset: (email: string, code: string) =>
    apiRequest("/auth/verify-reset-code", {
      method: "POST",
      body: JSON.stringify({ email, code }),
    }),

  resetPassword: (reset_token: string, new_password: string) =>
    apiRequest("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ reset_token, new_password }),
    }),

  me: () => apiRequest("/auth/me"),
  teams: () => apiRequest("/teams"),
  users: () => apiRequest("/users"),
  boards: () => apiRequest("/boards"),
  tasks: () => apiRequest("/tasks"),
  workflow: () => apiRequest("/workflow"),
  labels: () => apiRequest("/labels"),
  activity: () => apiRequest("/activity"),
};
'@

# ---------------------------------------------------------------------------
# Login page with Forgot Password flow
# ---------------------------------------------------------------------------
Write-Utf8NoBom "apps\web\src\app\page.tsx" @'
"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { api, setAuthToken } from "@/lib/api";

type LoginResponse = {
  success: boolean;
  token: string;
  user: {
    id: number;
    full_name: string;
    email: string;
    role: string;
    team_id: number | null;
  };
};

type ResetStep = "email" | "code" | "password" | "done";

export default function HomePage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [resetOpen, setResetOpen] = useState(false);
  const [resetStep, setResetStep] = useState<ResetStep>("email");
  const [resetEmail, setResetEmail] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [resetConfirm, setResetConfirm] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = (await api.login(email, password)) as LoginResponse;
      setAuthToken(response.token);
      localStorage.setItem("task_management_user", JSON.stringify(response.user));
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to sign in");
    } finally {
      setLoading(false);
    }
  }

  function openReset() {
    setResetEmail(email);
    setResetCode("");
    setResetToken("");
    setResetPassword("");
    setResetConfirm("");
    setResetError("");
    setResetStep("email");
    setResetOpen(true);
  }

  async function requestCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResetError("");
    setResetLoading(true);

    try {
      await api.requestPasswordReset(resetEmail);
      setResetStep("code");
    } catch (err) {
      setResetError(err instanceof Error ? err.message : "Unable to send reset code");
    } finally {
      setResetLoading(false);
    }
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResetError("");
    setResetLoading(true);

    try {
      const response = (await api.verifyPasswordReset(resetEmail, resetCode)) as {
        success: boolean;
        reset_token: string;
      };
      setResetToken(response.reset_token);
      setResetStep("password");
    } catch (err) {
      setResetError(err instanceof Error ? err.message : "Unable to verify code");
    } finally {
      setResetLoading(false);
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResetError("");

    if (resetPassword.length < 8) {
      setResetError("Password must be at least 8 characters.");
      return;
    }

    if (resetPassword !== resetConfirm) {
      setResetError("New password and confirm password do not match.");
      return;
    }

    setResetLoading(true);

    try {
      await api.resetPassword(resetToken, resetPassword);
      setPassword("");
      setResetStep("done");
    } catch (err) {
      setResetError(err instanceof Error ? err.message : "Unable to reset password");
    } finally {
      setResetLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f6f7fb] p-6">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-sm sm:p-10">
        <p className="text-sm font-semibold uppercase tracking-wider text-blue-600">
          Task Management System
        </p>

        <h1 className="mt-3 text-3xl font-semibold text-slate-950">Sign in</h1>
        <p className="mt-2 text-sm text-slate-500">
          Enter your account details to access your workspace.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          <div>
            <label htmlFor="email" className="mb-2 block text-sm font-medium text-slate-700">
              Email address
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoComplete="email"
              placeholder="you@company.com"
              className="h-12 w-full rounded-xl border border-slate-300 px-4 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <label htmlFor="password" className="block text-sm font-medium text-slate-700">
                Password
              </label>
              <button
                type="button"
                onClick={openReset}
                className="text-sm font-semibold text-blue-600 hover:text-blue-700"
              >
                Forgot password?
              </button>
            </div>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              autoComplete="current-password"
              placeholder="Enter your password"
              className="h-12 w-full rounded-xl border border-slate-300 px-4 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="h-12 w-full rounded-xl bg-[#101828] text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </div>

      {resetOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <button
            type="button"
            aria-label="Close password reset"
            className="absolute inset-0"
            onClick={() => setResetOpen(false)}
          />

          <div className="relative z-10 w-full max-w-md rounded-3xl bg-white p-7 shadow-2xl sm:p-8">
            <button
              type="button"
              onClick={() => setResetOpen(false)}
              className="absolute right-5 top-4 text-2xl text-slate-400 hover:text-slate-700"
              aria-label="Close"
            >
              ×
            </button>

            {resetStep === "email" ? (
              <form onSubmit={requestCode}>
                <p className="text-sm font-semibold uppercase tracking-wider text-blue-600">
                  Password Recovery
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-950">
                  Forgot password?
                </h2>
                <p className="mt-2 text-sm text-slate-500">
                  Enter the email registered with your Task Manager account.
                </p>

                <label className="mt-6 block text-sm font-medium text-slate-700">
                  Email address
                  <input
                    type="email"
                    required
                    value={resetEmail}
                    onChange={(event) => setResetEmail(event.target.value)}
                    className="mt-2 h-12 w-full rounded-xl border border-slate-300 px-4 outline-none focus:border-blue-500"
                  />
                </label>

                {resetError ? (
                  <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    {resetError}
                  </div>
                ) : null}

                <button
                  type="submit"
                  disabled={resetLoading}
                  className="mt-6 h-12 w-full rounded-xl bg-[#101828] text-sm font-semibold text-white disabled:opacity-60"
                >
                  {resetLoading ? "Sending..." : "Send 6-digit code"}
                </button>
              </form>
            ) : null}

            {resetStep === "code" ? (
              <form onSubmit={verifyCode}>
                <p className="text-sm font-semibold uppercase tracking-wider text-blue-600">
                  Verification
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-950">
                  Enter your code
                </h2>
                <p className="mt-2 text-sm text-slate-500">
                  We sent a 6-digit code to {resetEmail}. The code expires in 10 minutes.
                </p>

                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  required
                  value={resetCode}
                  onChange={(event) => setResetCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                  className="mt-6 h-14 w-full rounded-xl border border-slate-300 px-4 text-center text-2xl font-semibold tracking-[0.5em] outline-none focus:border-blue-500"
                />

                {resetError ? (
                  <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    {resetError}
                  </div>
                ) : null}

                <button
                  type="submit"
                  disabled={resetLoading || resetCode.length !== 6}
                  className="mt-6 h-12 w-full rounded-xl bg-[#101828] text-sm font-semibold text-white disabled:opacity-60"
                >
                  {resetLoading ? "Verifying..." : "Verify code"}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setResetError("");
                    setResetStep("email");
                  }}
                  className="mt-3 h-10 w-full text-sm font-semibold text-blue-600"
                >
                  Send another code
                </button>
              </form>
            ) : null}

            {resetStep === "password" ? (
              <form onSubmit={changePassword}>
                <p className="text-sm font-semibold uppercase tracking-wider text-blue-600">
                  New Password
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-950">
                  Create a new password
                </h2>
                <p className="mt-2 text-sm text-slate-500">
                  Use at least 8 characters.
                </p>

                <label className="mt-6 block text-sm font-medium text-slate-700">
                  New password
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={resetPassword}
                    onChange={(event) => setResetPassword(event.target.value)}
                    className="mt-2 h-12 w-full rounded-xl border border-slate-300 px-4 outline-none focus:border-blue-500"
                  />
                </label>

                <label className="mt-4 block text-sm font-medium text-slate-700">
                  Confirm password
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={resetConfirm}
                    onChange={(event) => setResetConfirm(event.target.value)}
                    className="mt-2 h-12 w-full rounded-xl border border-slate-300 px-4 outline-none focus:border-blue-500"
                  />
                </label>

                {resetError ? (
                  <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    {resetError}
                  </div>
                ) : null}

                <button
                  type="submit"
                  disabled={resetLoading}
                  className="mt-6 h-12 w-full rounded-xl bg-[#101828] text-sm font-semibold text-white disabled:opacity-60"
                >
                  {resetLoading ? "Changing password..." : "Change password"}
                </button>
              </form>
            ) : null}

            {resetStep === "done" ? (
              <div>
                <p className="text-sm font-semibold uppercase tracking-wider text-emerald-600">
                  Password Updated
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-950">
                  Your password has been changed
                </h2>
                <p className="mt-2 text-sm text-slate-500">
                  You can now sign in with your new password.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setEmail(resetEmail);
                    setResetOpen(false);
                  }}
                  className="mt-6 h-12 w-full rounded-xl bg-[#101828] text-sm font-semibold text-white"
                >
                  Back to sign in
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </main>
  );
}
'@

# ---------------------------------------------------------------------------
# Dashboard: direct workspace -> board, disable empty workspaces
# ---------------------------------------------------------------------------
Replace-Exact "apps\web\src\app\dashboard\page.tsx" @'
type Team = {
  id: number | string;
  name: string;
};

type Role = "Coordinator" | "Team Lead" | "Team Member";
'@ @'
type Team = {
  id: number | string;
  name: string;
};

type Board = {
  id: number;
  name: string;
  team_name: string | null;
};

type Role = "Coordinator" | "Team Lead" | "Team Member";
'@

Replace-Exact "apps\web\src\app\dashboard\page.tsx" @'
  const [teams, setTeams] = useState<Team[]>([]);
  const [showJoin, setShowJoin] = useState(false);
'@ @'
  const [teams, setTeams] = useState<Team[]>([]);
  const [boards, setBoards] = useState<Board[]>([]);
  const [showJoin, setShowJoin] = useState(false);
'@

Replace-Exact "apps\web\src\app\dashboard\page.tsx" @'
  useEffect(() => {
    if (!canJoinEmployee) return;

    void Promise.resolve().then(async () => {
'@ @'
  useEffect(() => {
    void Promise.resolve().then(async () => {
      try {
        const response = (await api.boards()) as {
          success: boolean;
          data: Board[];
        };
        setBoards(response.data ?? []);
      } catch {
        setBoards([]);
      }
    });
  }, []);

  useEffect(() => {
    if (!canJoinEmployee) return;

    void Promise.resolve().then(async () => {
'@

Replace-Exact "apps\web\src\app\dashboard\page.tsx" @'
      <section className="grid gap-5 md:grid-cols-3">
        {workspaces.map((workspace) => {
          const Icon = workspace.icon;

          return (
            <Link
              key={workspace.title}
              href={workspace.href}
              className="group min-h-[170px] rounded-2xl border border-white/40 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:border-violet-300 hover:shadow-xl"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-50 text-violet-700 transition group-hover:bg-violet-700 group-hover:text-white">
                <Icon size={21} />
              </div>

              <h2 className="mt-7 text-xl font-semibold text-slate-950">
                {workspace.title}
              </h2>

              <p className="mt-2 text-sm text-slate-500">
                {workspace.description}
              </p>
            </Link>
          );
        })}
      </section>
'@ @'
      <section className="grid gap-5 md:grid-cols-3">
        {workspaces.map((workspace) => {
          const Icon = workspace.icon;
          const workspaceName = workspace.title.toLowerCase();

          const board = boards.find((item) => {
            const searchable = `${item.name} ${item.team_name ?? ""}`.toLowerCase();
            return searchable.includes(workspaceName);
          });

          const cardContent = (
            <>
              <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${
                board
                  ? "bg-violet-50 text-violet-700 transition group-hover:bg-violet-700 group-hover:text-white"
                  : "bg-slate-100 text-slate-400"
              }`}>
                <Icon size={21} />
              </div>

              <h2 className="mt-7 text-xl font-semibold text-slate-950">
                {workspace.title}
              </h2>

              <p className="mt-2 text-sm text-slate-500">
                {board
                  ? `Open ${board.name}.`
                  : "No board data available yet."}
              </p>
            </>
          );

          if (!board) {
            return (
              <div
                key={workspace.title}
                aria-disabled="true"
                className="min-h-[170px] cursor-not-allowed rounded-2xl border border-white/30 bg-white/80 p-6 opacity-70 shadow-sm"
              >
                {cardContent}
              </div>
            );
          }

          return (
            <Link
              key={workspace.title}
              href={`/dashboard/boards?boardId=${board.id}`}
              className="group min-h-[170px] rounded-2xl border border-white/40 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:border-violet-300 hover:shadow-xl"
            >
              {cardContent}
            </Link>
          );
        })}
      </section>
'@

# ---------------------------------------------------------------------------
# Boards page: honor boardId from dashboard
# ---------------------------------------------------------------------------
Replace-Exact "apps\web\src\app\dashboard\boards\page.tsx" @'
import { useEffect, useMemo, useState } from "react";
import { api, apiRequest } from "@/lib/api";
'@ @'
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api, apiRequest } from "@/lib/api";
'@

Replace-Exact "apps\web\src\app\dashboard\boards\page.tsx" @'
export default function BoardsPage() {
  const { permissions, role } = useRole();
'@ @'
export default function BoardsPage() {
  const searchParams = useSearchParams();
  const requestedBoardId = Number(searchParams.get("boardId"));

  const { permissions, role } = useRole();
'@

Replace-Exact "apps\web\src\app\dashboard\boards\page.tsx" @'
      setSelectedBoardId((current) => {
        if (current && nextBoards.some((board) => board.id === current)) return current;
        return nextBoards[0]?.id ?? null;
      });
'@ @'
      setSelectedBoardId((current) => {
        if (current && nextBoards.some((board) => board.id === current)) return current;

        if (
          Number.isFinite(requestedBoardId) &&
          nextBoards.some((board) => Number(board.id) === requestedBoardId)
        ) {
          return requestedBoardId;
        }

        return nextBoards[0]?.id ?? null;
      });
'@

# ---------------------------------------------------------------------------
# Install email dependency and build both apps
# ---------------------------------------------------------------------------
Write-Host ""
Write-Host "Installing backend mail dependency..." -ForegroundColor Cyan
Push-Location "apps\api"
npm install nodemailer
npm install -D @types/nodemailer
npm run build
Pop-Location

Write-Host ""
Write-Host "Building frontend..." -ForegroundColor Cyan
Push-Location "apps\web"
npm run build
Pop-Location

Write-Host ""
Write-Host "All code changes applied and both builds passed." -ForegroundColor Green
Write-Host "Next: run the Neon migration, configure SMTP variables in Vercel, then git add/commit/push." -ForegroundColor Yellow
