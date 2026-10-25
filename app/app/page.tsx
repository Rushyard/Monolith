import Link from "next/link";

import { Hero } from "./fx/hero";

const CHAPTERS = [
  {
    n: "I",
    href: "/vault",
    title: "Le coffre",
    body: "Tes USDC dans un coffre confidentiel. Les soldes et les montants des transferts sont cachés on-chain.",
  },
  {
    n: "II",
    href: "/agent",
    title: "L'agent",
    body: "Un agent IA qui paie seul sous un plafond. Au-delà, c'est le réseau Stellar qui refuse — pas notre serveur.",
  },
  {
    n: "III",
    href: "/auditor",
    title: "L'auditeur",
    body: "Seule la clé de l'auditeur désigné révèle les montants. La clé publique de la démo de référence est refusée.",
  },
];

const VISIBLE = [
  "Toutes les adresses (expéditeur, destinataire)",
  "Dépôts dans le coffre et retraits du coffre",
  "Paiements de l'agent (budget public, plafonné)",
  "Le fait qu'une adresse a un compte confidentiel",
];
const HIDDEN = ["Soldes du coffre confidentiel", "Montants des transferts confidentiels"];

export default function Home() {
  return (
    <>
      <Hero tagline="Ta trésorerie reste confidentielle. Ton agent ne peut dépenser que ce que le contrat lui autorise." />

      <section className="grid cols-3">
        {CHAPTERS.map((c) => (
          <Link key={c.href} href={c.href} className="chapter-card">
            <span className="chapter">Chapitre {c.n}</span>
            <h3>{c.title}</h3>
            <p>{c.body}</p>
          </Link>
        ))}
      </section>

      <div className="spacer" />

      <section className="grid cols-2">
        <div className="panel">
          <h2 className="section">Visible on-chain</h2>
          <ul className="stack" style={{ margin: 0, paddingLeft: 18, color: "var(--muted)" }}>
            {VISIBLE.map((v) => <li key={v}>{v}</li>)}
          </ul>
        </div>
        <div className="panel">
          <h2 className="section">Caché on-chain</h2>
          <ul className="stack" style={{ margin: 0, paddingLeft: 18 }}>
            {HIDDEN.map((v) => <li key={v}>{v}</li>)}
          </ul>
          <p className="chapter" style={{ marginTop: 24 }}>Confidentiel, pas anonyme.</p>
        </div>
      </section>
    </>
  );
}
