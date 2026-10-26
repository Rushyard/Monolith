import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SiteFooter, SiteHeader } from "./nav";
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
          <SiteHeader />
          <Intertitle />
          <main>{children}</main>
          <SiteFooter />
        </I18nProvider>
      </body>
    </html>
  );
}
