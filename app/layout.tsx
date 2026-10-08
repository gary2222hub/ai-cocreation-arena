import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI 共创场",
  description: "把一场 AI 共创活动组织得清楚、从容、可回顾。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
