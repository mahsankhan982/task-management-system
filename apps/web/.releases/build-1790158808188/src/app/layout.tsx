import type { Metadata } from "next";
import "./globals.css";
import PwaRegister from "@/components/pwa-register";

export const metadata: Metadata = {
  title: "Task Manager",
  description: "Task management workspace for Creative, Website and Digital teams.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/chakor-logo-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/chakor-logo-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/icons/chakor-logo-180.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}