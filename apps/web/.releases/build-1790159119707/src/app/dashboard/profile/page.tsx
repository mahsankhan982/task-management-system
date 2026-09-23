"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRole } from "@/contexts/role-context";
import { apiRequest, uploadProfilePhoto } from "@/lib/api";
import UserAvatar, { publishProfilePhoto } from "@/components/profile/user-avatar";

type ProfileResponse = { data: { full_name: string; email: string } };

export default function ProfileSettingsPage() {
  const { user, updateProfile, updateAvatar } = useRole();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [verification, setVerification] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  useEffect(() => {
    const token = new URLSearchParams(window.location.hash.slice(1)).get("verify");
    if (token) { setVerification(token); window.history.replaceState(null, "", window.location.pathname); }
  }, []);
  useEffect(() => {
    if (!photo) { setPreview(""); return; }
    const url = URL.createObjectURL(photo); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try { await action(); } catch (err) { setError(err instanceof Error ? err.message : "Unable to save changes."); }
    finally { setBusy(false); }
  }
  function save(event: FormEvent<HTMLFormElement>, kind: "name" | "password" | "email") {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    void run(async () => {
      if (kind === "email") {
        await apiRequest("/profile/email/request", { method: "POST", body: JSON.stringify(Object.fromEntries(data)) });
        setNotice("Check your new email for a verification link. Your current email stays active until you confirm.");
      } else {
        if (kind === "password" && data.get("new_password") !== data.get("confirm_password")) throw new Error("Passwords do not match.");
        data.delete("confirm_password");
        const response = await apiRequest<ProfileResponse>("/profile/me", { method: "PATCH", body: JSON.stringify(Object.fromEntries(data)) });
        updateProfile(response.data);
        setNotice(kind === "name" ? "Name updated." : "Password updated.");
      }
      if (kind !== "name") form.reset();
    });
  }
  return <main className="profile-settings mx-auto w-full max-w-4xl space-y-6 p-4 md:p-8">
    <div><p className="text-xs font-semibold uppercase tracking-[.2em] text-[var(--theme-accent)]">Your account</p><h1 className="mt-2 text-3xl font-semibold">Profile Settings</h1><p className="mt-2 text-sm text-[var(--theme-muted)]">Manage your personal details and account security.</p></div>
    {error && <p role="alert" className="rounded-xl border border-red-400/40 bg-red-400/10 p-4">{error}</p>}
    {notice && <p role="status" className="rounded-xl border border-cyan-400/40 bg-cyan-400/10 p-4">{notice}</p>}
    {verification && <section className="theme-glass rounded-2xl border p-6"><h2 className="text-lg font-semibold">Confirm your new email</h2><p className="my-3 text-sm">Confirm while signed into the account that requested this change.</p><button disabled={busy} onClick={() => void run(async () => {
      const response = await apiRequest<ProfileResponse>("/profile/email/verify", { method: "POST", body: JSON.stringify({ token: verification }) });
      updateProfile(response.data); setVerification(""); setNotice("Email verified and updated.");
    })}>Verify email</button></section>}
    <fieldset disabled={busy} className="grid min-w-0 gap-6 md:grid-cols-2">
      <section className="theme-glass rounded-2xl border p-6">
        <h2 className="mb-5 text-lg font-semibold">Profile photo</h2>
        <div className="mb-4 flex items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {preview ? <img src={preview} alt="Selected profile preview" className="h-20 w-20 rounded-full border border-amber-200/50 object-cover" /> : <UserAvatar user={user} size={80} />}
          <div><p className="font-semibold">{user.full_name}</p><p className="text-sm text-[var(--theme-muted)]">{user.role}</p></div>
        </div>
        <label>Change photo<input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => {
          const file = event.target.files?.[0]; event.target.value = ""; setError(""); setPhoto(null);
          if (!file) return;
          if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) { setError("Choose a JPG, PNG or WEBP image under 5 MB."); return; }
          setPhoto(file);
        }} /></label>
        <p className="mb-4 text-xs text-[var(--theme-muted)]">JPG, PNG or WEBP, up to 5 MB.</p>
        <button disabled={busy || !photo} onClick={() => void run(async () => {
          if (!photo) return;
          const response = await uploadProfilePhoto(photo); updateAvatar(response.data.avatar_url); publishProfilePhoto(user.id, response.data.avatar_url); setPhoto(null); setNotice("Profile photo saved.");
        })}>Save photo</button>
      </section>
      <form onSubmit={event => save(event, "name")} className="theme-glass rounded-2xl border p-6"><h2 className="mb-5 text-lg font-semibold">Personal details</h2><label>Full name<input name="full_name" autoComplete="name" defaultValue={user.full_name} required maxLength={120} /></label><p className="mb-5 break-all text-sm text-[var(--theme-muted)]">{user.email}</p><button>Save name</button></form>
      <form onSubmit={event => save(event, "email")} className="theme-glass rounded-2xl border p-6"><h2 className="mb-5 text-lg font-semibold">Change email</h2><label>New email<input name="email" type="email" autoComplete="email" required maxLength={254} /></label><label>Current password<input name="current_password" type="password" autoComplete="current-password" required /></label><button>Send verification link</button></form>
      <form onSubmit={event => save(event, "password")} className="theme-glass rounded-2xl border p-6"><h2 className="mb-5 text-lg font-semibold">Change password</h2><label>Current password<input name="current_password" type="password" autoComplete="current-password" required /></label><label>New password<input name="new_password" type="password" autoComplete="new-password" minLength={8} maxLength={72} required /></label><label>Confirm new password<input name="confirm_password" type="password" autoComplete="new-password" minLength={8} maxLength={72} required /></label><button>Update password</button></form>
    </fieldset>
    {busy && <p role="status">Saving changes…</p>}
  </main>;
}
