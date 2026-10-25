import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Monolith",
  description:
    "Ta trésorerie reste confidentielle. Ton agent ne peut dépenser que ce que le contrat lui autorise.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <header>
          <Link href="/">Monolith</Link>
          <nav>
            <Link href="/vault">Coffre</Link>
            <Link href="/agent">Agent</Link>
          </nav>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
