"use client";

import { useState } from "react";

export function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "CK"
  );
}

/**
 * Shows the user's Google profile photo when one has been linked, and falls
 * back to their initials. Google photo URLs are served from a Google CDN, so
 * a plain <img> is used to keep them outside the Next image optimiser.
 */
export default function UserAvatar({
  name,
  avatarUrl,
  size = 36,
  className = "",
  title,
}: {
  name: string;
  avatarUrl?: string | null;
  size?: number;
  className?: string;
  title?: string;
}) {
  const [failed, setFailed] = useState(false);
  const showPhoto = Boolean(avatarUrl) && !failed;

  return (
    <span
      title={title}
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#0c66e4] font-bold text-white ring-2 ring-blue-100 ${className}`}
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.34) }}
    >
      {showPhoto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarUrl as string}
          alt={name}
          width={size}
          height={size}
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        initials(name)
      )}
    </span>
  );
}
