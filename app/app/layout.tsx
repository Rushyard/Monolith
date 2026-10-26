import type { Metadata, Viewport } from "next";
import { Instrument_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { SiteFooter, SiteHeader, SkipLink } from "./nav";
import { I18nProvider } from "@/lib/i18n/react";

const instrument = Instrument_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-instrument", display: "swap" });
const plex = IBM_Plex_Mono({ subsets: ["latin"], weight: "400", variable: "--font-plex", display: "swap" });

export const metadata: Metadata = {
  title: "Monolith",
  description: "Your treasury stays confidential. Your agent can only spend what the contract allows.",
};

export const viewport: Viewport = { themeColor: "#000000", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${instrument.variable} ${plex.variable}`}>
      <body>
        <I18nProvider>
          <SkipLink />
          <SiteHeader />
          <main id="main-content" tabIndex={-1}>{children}</main>
          <SiteFooter />
        </I18nProvider>
      </body>
    </html>
  );
}
