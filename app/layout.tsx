import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Scopeboard — Project tracker",
  description: "Track project scope, delivery risk, and progress in one focused Gantt workspace.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
  openGraph: {
    title: "Scopeboard",
    description: "Project plan, without the guesswork.",
    images: [{ url: "/og.png", width: 1200, height: 630 }],
  },
  twitter: { card: "summary_large_image", title: "Scopeboard", description: "Project plan, without the guesswork.", images: ["/og.png"] },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
