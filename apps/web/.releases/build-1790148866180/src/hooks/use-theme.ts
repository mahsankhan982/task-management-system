"use client";

import { useSyncExternalStore } from "react";

type Theme = "dark" | "light";
const storageKey = "chakor-ui-theme";
const changeEvent = "chakor-theme-change";
let fallback: Theme = "dark";

function getSnapshot(): Theme {
  try {
    const saved = window.localStorage.getItem(storageKey);
    return saved === "light" || saved === "dark" ? saved : fallback;
  } catch {
    return fallback;
  }
}

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(changeEvent, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(changeEvent, callback);
  };
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, () => "dark" as Theme);
  function toggleTheme() {
    fallback = getSnapshot() === "dark" ? "light" : "dark";
    try {
      window.localStorage.setItem(storageKey, fallback);
    } catch {
      // The toggle still works when browser storage is unavailable.
    }
    window.dispatchEvent(new Event(changeEvent));
  }
  return { theme, toggleTheme };
}
