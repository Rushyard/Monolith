import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import { Nav } from "./nav";
import { Intertitle } from "./fx/intertitle";
import { I18nProvider } from "@/lib/i18n/react";

export const metadata: Metadata = {
  title: "Monolith",
  description: "Your treasury stays confidential. Your agent can only spend what the contract allows.",
};

export const viewport: Viewport = { themeColor: "#000000", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Jost:wght@300;400;500&family=Michroma&display=swap"
        />
      </head>
      <body>
        <I18nProvider>
          <header className="site-header">
            <Link href="/" className="wordmark">Monolith</Link>
            <Nav />
          </header>
          <Intertitle />
          <main>{children}</main>
          <footer className="site-footer">Stellar testnet · HackMeridian 2026</footer>
        </I18nProvider>
      </body>
    </html>
  );
}
