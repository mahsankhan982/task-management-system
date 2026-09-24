"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useRole } from "@/contexts/role-context";
import { apiRequest } from "@/lib/api";
import ProfileForm from "@/components/profile/profile-form";

export default function ProfileSettingsPage() {
  const { updateProfile } = useRole();
  const router = useRouter();
  const [verification, setVerification] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    const token = new URLSearchParams(window.location.hash.slice(1)).get("verify");
    if (token) { setVerification(token); window.history.replaceState(null, "", window.location.pathname); }
  }, []);
  async function verifyEmail() {
    setBusy(true); setMessage("");
    try {
      const response = await apiRequest<{ data: { full_name: string; email: string } }>("/profile/email/verify", { method: "POST", body: JSON.stringify({ token: verification }) });
      updateProfile(response.data); setVerification(""); setMessage("Email verified and updated.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to verify email."); }
    finally { setBusy(false); }
  }
  return <div className="profile-settings mx-auto w-full max-w-xl p-4 md:p-8">
    <section className="theme-glass rounded-2xl border p-6">
      <h1 className="text-2xl font-semibold">Profile Settings</h1>
      {message && <p role="status" className="my-4 text-sm">{message}</p>}
      {verification ? <div className="mt-5"><p className="mb-4">Confirm your new email address for this account.</p><button disabled={busy} onClick={() => void verifyEmail()}>Verify email</button><button className="ml-3" disabled={busy} onClick={() => router.push("/dashboard")}>Cancel</button></div> : <ProfileForm onCancel={() => router.push("/dashboard")} />}
    </section>
  </div>;
}
