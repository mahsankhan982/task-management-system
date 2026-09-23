"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import Link from "next/link";
import { Camera, Settings, LogOut, Layers, X } from "lucide-react";
import { useRole } from "@/contexts/role-context";
import UserAvatar, { saveProfilePhoto } from "./user-avatar";
import "./profile.css";

export default function ProfileMenu({ onLogout }: { onLogout: () => void }) {
  const { user } = useRole();
  const menu = useRef<HTMLDetailsElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLElement>(null);
  const selection = useRef(0);
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [processing, setProcessing] = useState(false);
  const [settings, setSettings] = useState(false);

  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (!menu.current?.contains(event.target as Node) && menu.current) menu.current.open = false;
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && menu.current?.open) {
        menu.current.open = false;
        trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, []);

  function openEditor(showSettings: boolean) {
    if (menu.current) menu.current.open = false;
    selection.current++;
    setSettings(showSettings);
    setPreview(""); setError(""); setNotice(""); setProcessing(false);
    dialog.current?.showModal();
  }

  async function choosePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const current = ++selection.current;
    setPreview(""); setError(""); setNotice(""); setProcessing(false);
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Choose a JPG, PNG or WEBP image."); return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Choose an image smaller than 5 MB."); return;
    }
    setProcessing(true);
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 256;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Image preview is unavailable.");
      const side = Math.min(image.naturalWidth, image.naturalHeight);
      context.drawImage(image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2, side, side, 0, 0, 256, 256);
      if (current === selection.current) setPreview(canvas.toDataURL("image/webp", 0.85));
    } catch {
      if (current === selection.current) setError("This image could not be opened. Please choose another image.");
    } finally {
      URL.revokeObjectURL(url);
      if (current === selection.current) setProcessing(false);
    }
  }

  function save() {
    try {
      saveProfilePhoto(user.id, preview);
      setPreview(""); setNotice("Profile photo saved in this browser.");
    } catch {
      setError("Unable to save: browser storage is full or unavailable.");
    }
  }

  return (
    <>
      <details ref={menu} className="profile-menu relative shrink-0">
        <summary ref={trigger} aria-label="Open profile menu" className="cursor-pointer list-none rounded-full focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-300">
          <UserAvatar user={user} />
        </summary>
        <div className="profile-panel absolute right-0 top-12 z-[160] w-72 max-w-[calc(100vw-2rem)] rounded-2xl border p-4 shadow-2xl">
          <div className="mb-4 flex flex-col items-center gap-2 border-b border-current/15 pb-4 text-center">
            <UserAvatar user={user} size={80} />
            <p className="max-w-full break-words font-semibold">{user.full_name}</p>
            <p className="text-xs opacity-75">{user.role}</p>
          </div>
          <button type="button" onClick={() => openEditor(false)}><Camera size={17} /> Change Photo</button>
          <button type="button" onClick={() => openEditor(true)}><Settings size={17} /> Profile Settings</button>
          <Link href="/dashboard" onClick={() => { if (menu.current) menu.current.open = false; }}><Layers size={17} /> Switch workspace</Link>
          <button type="button" onClick={onLogout}><LogOut size={17} /> Logout</button>
        </div>
      </details>
      <dialog ref={dialog} className="profile-editor" aria-labelledby="profile-editor-title" onClose={() => { selection.current++; trigger.current?.focus(); }}>
        <button type="button" aria-label="Close profile settings" onClick={() => dialog.current?.close()} className="absolute right-4 top-4 rounded-lg p-2 hover:bg-white/10"><X size={20} /></button>
        <h2 id="profile-editor-title" className="pr-10 text-xl font-semibold">{settings ? "Profile Settings" : "Change Photo"}</h2>
        <div className="my-6 flex justify-center">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="New profile photo preview" className="h-28 w-28 rounded-full border-2 border-[#D8BF80] object-cover" />
          ) : <UserAvatar user={user} size={112} />}
        </div>
        <p className="text-center font-semibold">{user.full_name}</p>
        <p className="mt-1 text-center text-sm opacity-80">{user.role}</p>
        {settings && <p className="mt-2 break-all text-center text-sm opacity-80">{user.email}</p>}
        <label className="mt-6 block text-sm">Choose profile photo
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={choosePhoto} className="mt-2 block w-full rounded-xl border border-current/20 p-2 text-xs file:mr-3 file:rounded-lg file:border-0 file:bg-[#E9D399] file:px-3 file:py-2 file:text-[#142d40]" />
        </label>
        <p className="mt-2 text-xs opacity-75">JPG, PNG or WEBP, up to 5 MB. Photos are saved only in this browser and are not shared with other users or devices.</p>
        {processing && <p role="status" className="mt-3 text-sm">Preparing preview...</p>}
        {error && <p role="alert" className="mt-3 text-sm text-red-400">{error}</p>}
        {notice && <p role="status" className="mt-3 text-sm">{notice}</p>}
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={() => dialog.current?.close()} className="rounded-xl border border-current/20 px-4 py-2">Close</button>
          <button type="button" disabled={!preview || processing} onClick={save} className="rounded-xl bg-[#E9D399] px-4 py-2 font-semibold text-[#142d40] disabled:opacity-40">Save photo</button>
        </div>
      </dialog>
    </>
  );
}
