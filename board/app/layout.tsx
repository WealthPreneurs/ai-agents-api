import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Board of Directors",
  description: "Multi-agent AI advisory board",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
