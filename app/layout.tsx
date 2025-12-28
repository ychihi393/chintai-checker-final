import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css"; // ★この1行がないと色がつきません！

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "賃貸見積もりチェッカー",
  description: "AIで見積もりを適正診断",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className={inter.className}>{children}</body>
    </html>
  );
}