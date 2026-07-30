import type { Metadata } from "next";
import { Noto_Sans_JP, Noto_Serif_JP } from "next/font/google";
import "./globals.css";
import "./phase2.css";

const sans = Noto_Sans_JP({
  variable: "--font-sans-jp",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const serif = Noto_Serif_JP({
  variable: "--font-serif-jp",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "Bunki 分岐 — Living Japanese",
  description:
    "A recursive Japanese learning environment connecting dictionary, kanji, reading, conversation, source mining, and living SRS.",
  other: {
    "codex-preview": "development",
  },
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
    <html lang="en">
      <body className={`${sans.variable} ${serif.variable}`}>{children}</body>
    </html>
  );
}
