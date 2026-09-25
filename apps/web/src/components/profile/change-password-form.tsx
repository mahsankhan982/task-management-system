"use client";

import { useState, type FormEvent } from "react";
import { api } from "@/lib/api";

// Reuse the existing email-code recovery API; never add a profile password endpoint.
export default function ChangePasswordForm({ email, onCancel }: { email: string; onCancel: () => void }) {
  const [step, setStep] = useState<"request" | "verify" | "password" | "done">("request");
  const [code, setCode] = useState("");
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError("");
    try {
      if (step === "request") {
        await api.requestPasswordReset(email); setStep("verify");
      } else if (step === "verify") {
        const result = await api.verifyPasswordReset(email, code) as { reset_token: string };
        setToken(result.reset_token); setStep("password");
      } else if (step === "password") {
        if (password.length < 8) throw new Error("Use at least 8 characters.");
        if (password !== confirmation) throw new Error("Passwords do not match.");
        await api.resetPassword(token, password);
        setPassword(""); setConfirmation(""); setToken(""); setStep("done");
      }
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to change password. Please retry."); }
    finally { setBusy(false); }
  }
  return <form className="profile-settings mt-4 space-y-4" onSubmit={submit}>
    <p className="text-sm">{step === "done" ? "Password changed. Use your new password the next time you sign in." : `Verify your identity with a code sent to ${email}.`}</p>
    <fieldset disabled={busy}>
      {step === "verify" && <label>Verification code<input autoFocus autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={code} onChange={event => setCode(event.target.value)} required /></label>}
      {step === "password" && <>
        <label>New password<input autoFocus type="password" autoComplete="new-password" minLength={8} value={password} onChange={event => setPassword(event.target.value)} required /></label>
        <label>Confirm password<input type="password" autoComplete="new-password" minLength={8} value={confirmation} onChange={event => setConfirmation(event.target.value)} required /></label>
      </>}
    </fieldset>
    {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
    <div className="flex justify-end gap-3">
      <button type="button" disabled={busy} onClick={onCancel}>{step === "done" ? "Done" : "Cancel"}</button>
      {step !== "done" && <button type="submit" disabled={busy}>{busy ? "Please wait..." : step === "request" ? "Send verification code" : step === "verify" ? "Verify code" : "Change password"}</button>}
    </div>
  </form>;
}
