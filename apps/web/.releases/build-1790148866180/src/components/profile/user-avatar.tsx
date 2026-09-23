"use client";

import { useState, useSyncExternalStore } from "react";

export type AvatarUser = { id?: number | string | null; full_name: string; avatar_url?: string | null };
const eventName = "chakor-profile-photo";
const key = (id: number | string) => `chakor-profile-photo:${id}`;

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(eventName, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(eventName, callback);
  };
}

export function saveProfilePhoto(id: number | string, photo: string) {
  // Keep presentation data separate from authentication/session storage.
  localStorage.setItem(key(id), JSON.stringify({ avatar_url: photo }));
  window.dispatchEvent(new Event(eventName));
}

function readPhoto(id: AvatarUser["id"]): string {
  if (id == null) return "";
  try {
    const profile = JSON.parse(localStorage.getItem(key(id)) || "{}");
    return typeof profile.avatar_url === "string" ? profile.avatar_url : "";
  } catch { return ""; }
}

export default function UserAvatar({ user, size = 36, className = "" }: {
  user: AvatarUser; size?: number; className?: string;
}) {
  const localPhoto = useSyncExternalStore(subscribe, () => readPhoto(user.id), () => "");
  const photo = localPhoto || user.avatar_url || "";
  const [failedPhoto, setFailedPhoto] = useState("");
  const initials = user.full_name.trim().split(/\s+/).slice(0, 2).map(part => part[0] || "").join("").toUpperCase() || "?";
  return (
    <span title={user.full_name} style={{ width: size, height: size, fontSize: Math.max(10, size / 3) }}
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-[#D8BF80]/70 bg-gradient-to-br from-[#0B2135] to-[#1B4A6C] font-semibold text-white shadow-[0_0_10px_rgba(201,174,109,0.15)] ${className}`}>
      {photo && failedPhoto !== photo ? (
        // Uploaded data URLs and API-hosted images need no Next image optimization.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo} alt={user.full_name} className="h-full w-full object-cover" onError={() => setFailedPhoto(photo)} />
      ) : <span aria-label={user.full_name}>{initials}</span>}
    </span>
  );
}
