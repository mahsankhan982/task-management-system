"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRole } from "@/contexts/role-context";
import { apiRequest, uploadProfilePhoto } from "@/lib/api";
import UserAvatar, { publishProfilePhoto } from "./user-avatar";

export default function ProfileForm({ onCancel, photoFirst = false }: { onCancel: () => void; photoFirst?: boolean }) {
  const { user, updateProfile, updateAvatar } = useRole();
  const [name, setName] = useState(user.full_name);
  const [email, setEmail] = useState(user.email);
  const [requestedEmail, setRequestedEmail] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    if (!photo) { setPreview(""); return; }
    const url = URL.createObjectURL(photo); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    const saved: string[] = [];
    try {
      if (!name.trim()) throw new Error("Enter your full name.");
      if (name.trim() !== user.full_name) {
        const response = await apiRequest<{ data: { full_name: string; email: string } }>("/profile/me", { method: "PATCH", body: JSON.stringify({ full_name: name.trim() }) });
        updateProfile(response.data); setName(response.data.full_name); saved.push("Name");
      }
      if (photo) {
        const response = await uploadProfilePhoto(photo);
        updateAvatar(response.data.avatar_url); publishProfilePhoto(user.id, response.data.avatar_url); setPhoto(null); saved.push("Photo");
      }
      const nextEmail = email.trim().toLowerCase();
      if (nextEmail !== user.email.toLowerCase() && nextEmail !== requestedEmail) {
        await apiRequest("/profile/email/request", { method: "POST", body: JSON.stringify({ email: nextEmail }) });
        setRequestedEmail(nextEmail);
      }
      setNotice(nextEmail !== user.email.toLowerCase() ? "Profile saved. Check your new email for the verification link. Your current email stays active until you confirm." : "Profile saved.");
    } catch (err) {
      setError(`${saved.length ? saved.join(" and ") + " saved. " : ""}${err instanceof Error ? err.message : "Unable to save profile."}`);
    } finally { setBusy(false); }
  }

  return <form onSubmit={save} className="profile-settings space-y-4">
    <fieldset disabled={busy} className="min-w-0">
      <div className="my-5 flex justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {preview ? <img src={preview} alt="New profile photo preview" className="h-24 w-24 rounded-full border border-amber-200/50 object-cover" /> : <UserAvatar user={user} size={96} />}
      </div>
      <label>Profile picture<input autoFocus={photoFirst} type="file" accept="image/jpeg,image/png,image/webp" onChange={event => {
        const file = event.target.files?.[0]; event.target.value = ""; setPhoto(null); setError(""); setNotice("");
        if (!file) return;
        if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) { setError("Choose a JPG, PNG or WEBP image under 5 MB."); return; }
        setPhoto(file);
      }} /></label>
      <p className="mb-5 text-xs opacity-75">JPG, PNG or WEBP, up to 5 MB.</p>
      <label>Full name<input name="full_name" autoComplete="name" value={name} onChange={event => setName(event.target.value)} required maxLength={120} /></label>
      <label>Email<input name="email" type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} required maxLength={254} /></label>
      <p className="text-xs opacity-75">A new email address must be verified before it replaces your current address.</p>
    </fieldset>
    {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
    {notice && <p role="status" className="text-sm">{notice}</p>}
    <div className="flex justify-end gap-3">
      <button type="button" disabled={busy} onClick={onCancel}>Cancel</button>
      <button type="submit" disabled={busy}>{busy ? "Saving..." : "Save"}</button>
    </div>
  </form>;
}
