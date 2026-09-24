"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Camera, Settings, LogOut, Layers } from "lucide-react";
import { useRole } from "@/contexts/role-context";
import UserAvatar from "./user-avatar";
import ProfileForm from "./profile-form";
import "./profile.css";

export default function ProfileMenu({ onLogout }: { onLogout: () => void }) {
  const { user } = useRole();
  const menu = useRef<HTMLDetailsElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLElement>(null);
  const [editor, setEditor] = useState<"photo" | "settings" | null>(null);
  useEffect(() => {
    const outside = (event: PointerEvent) => { if (menu.current && !menu.current.contains(event.target as Node)) menu.current.open = false; };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape" && menu.current?.open) { menu.current.open = false; trigger.current?.focus(); } };
    document.addEventListener("pointerdown", outside); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, []);
  useEffect(() => { if (editor) dialog.current?.showModal(); }, [editor]);
  function openEditor(mode: "photo" | "settings") { if (menu.current) menu.current.open = false; setEditor(mode); }
  return <>
    <details ref={menu} className="profile-menu relative shrink-0">
      <summary ref={trigger} aria-label="Open profile menu" className="cursor-pointer list-none rounded-full focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-300"><UserAvatar user={user} /></summary>
      <div className="profile-panel absolute right-0 top-12 z-[160] w-72 max-w-[calc(100vw-2rem)] rounded-2xl border p-4 shadow-2xl">
        <div className="mb-4 flex flex-col items-center gap-2 border-b border-current/15 pb-4 text-center"><UserAvatar user={user} size={80} /><p className="max-w-full break-words font-semibold">{user.full_name}</p><p className="text-xs opacity-75">{user.role}</p></div>
        <button type="button" onClick={() => openEditor("photo")}><Camera size={17} /> Change Photo</button>
        <button type="button" onClick={() => openEditor("settings")}><Settings size={17} /> Profile Settings</button>
        <Link href="/dashboard" onClick={() => { if (menu.current) menu.current.open = false; }}><Layers size={17} /> Switch workspace</Link>
        <button type="button" onClick={onLogout}><LogOut size={17} /> Logout</button>
      </div>
    </details>
    <dialog ref={dialog} className="profile-editor" aria-labelledby="profile-editor-title" onClose={() => { setEditor(null); trigger.current?.focus(); }}>
      <h2 id="profile-editor-title" className="text-xl font-semibold">Profile Settings</h2>
      {editor && <ProfileForm photoFirst={editor === "photo"} onCancel={() => dialog.current?.close()} />}
    </dialog>
  </>;
}
