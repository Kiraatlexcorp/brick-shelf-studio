import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Brick Shelf Studio",
  description: "Build Lego-style furniture from 3D-printed snap panels. 3MF for Bambu A1.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#d6402b" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-svh antialiased">{children}</body>
    </html>
  );
}
