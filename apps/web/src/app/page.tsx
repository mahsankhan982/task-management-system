"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
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
  const [showPassword, setShowPassword] = useState(false);
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
            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                autoComplete="current-password"
                placeholder="Enter your password"
                className="h-12 w-full rounded-xl border border-slate-300 px-4 pr-12 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                aria-label={showPassword ? "Hide password" : "Show password"}
                title={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
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
              Ã—
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