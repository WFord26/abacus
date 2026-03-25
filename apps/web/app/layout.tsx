import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";

import { Providers } from "../src/components/providers";

import type { Metadata } from "next";

import "./globals.css";

const sans = IBM_Plex_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["400", "500", "600", "700"],
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Abacus",
  description: "Accounting workflows for small business teams.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html suppressHydrationWarning lang="en">
      <body className={`${sans.variable} ${mono.variable} min-h-screen bg-app text-foreground`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
