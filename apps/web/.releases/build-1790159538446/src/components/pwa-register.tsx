"use client";

import { useEffect } from "react";
import { clearApplicationCaches } from "@/lib/app-updates";

export default function PwaRegister() {
  useEffect(() => {
    // Preserve the current release gateway's network-first setup, scoped to our app.
    void clearApplicationCaches().catch(() => {});
  }, []);
  return null;
}

