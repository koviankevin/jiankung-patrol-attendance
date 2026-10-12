import type { Metadata } from "next";
import "./patrol.css";

export const metadata: Metadata = {
  title: "建功高中｜巡堂點名",
  description: "依考程快速確認班級出席，清楚記錄每一場考試。",
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
    <html lang="zh-Hant">
      <body className="antialiased">{children}</body>
    </html>
  );
}

