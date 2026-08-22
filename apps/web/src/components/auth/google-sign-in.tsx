"use client";

import { useEffect, useRef, useState } from "react";

const GSI_SRC = "https://accounts.google.com/gsi/client";
const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";

type CredentialResponse = { credential?: string };

type GoogleIdentity = {
  accounts: {
    id: {
      initialize: (config: {
        client_id: string;
        callback: (response: CredentialResponse) => void;
        auto_select?: boolean;
      }) => void;
      renderButton: (
        parent: HTMLElement,
        options: Record<string, string | number>,
      ) => void;
    };
  };
};

declare global {
  interface Window {
    google?: GoogleIdentity;
  }
}

function loadGsiScript() {
  return new Promise<void>((resolve, reject) => {
    if (window.google?.accounts?.id) {
      resolve();
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${GSI_SRC}"]`,
    );

    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("load failed")));
      return;
    }

    const script = document.createElement("script");
    script.src = GSI_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("load failed"));
    document.head.appendChild(script);
  });
}

/**
 * Renders Google's official sign-in button. Nothing is rendered at all when
 * NEXT_PUBLIC_GOOGLE_CLIENT_ID is unset, so the password form stays the only
 * way in until Google is actually configured.
 */
export default function GoogleSignIn({
  onCredential,
  disabled = false,
}: {
  onCredential: (credential: string) => void;
  disabled?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const callbackRef = useRef(onCredential);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    callbackRef.current = onCredential;
  }, [onCredential]);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;

    let cancelled = false;

    void loadGsiScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.google) return;

        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: (response) => {
            if (response.credential) callbackRef.current(response.credential);
          },
        });

        window.google.accounts.id.renderButton(containerRef.current, {
          theme: "outline",
          size: "large",
          shape: "pill",
          text: "signin_with",
          logo_alignment: "center",
          width: 320,
        });
      })
      .catch(() => {
        if (!cancelled) setUnavailable(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!GOOGLE_CLIENT_ID) return null;

  return (
    <div className="mt-6">
      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-slate-200" />
        <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
          or
        </span>
        <span className="h-px flex-1 bg-slate-200" />
      </div>

      {unavailable ? (
        <p className="mt-4 text-center text-xs text-slate-500">
          Google sign-in is unavailable right now. Use your email and password.
        </p>
      ) : (
        <div
          ref={containerRef}
          aria-busy={disabled}
          className={`mt-4 flex justify-center ${
            disabled ? "pointer-events-none opacity-60" : ""
          }`}
        />
      )}
    </div>
  );
}
