import Link from "next/link";

export default function Home() {
  return (
    <section>
      <h1>Monolith</h1>
      <p>
        Ta trésorerie reste confidentielle. Ton agent ne peut dépenser que ce que le contrat lui
        autorise.
      </p>
      <ul>
        <li><Link href="/vault">Coffre confidentiel</Link></li>
        <li><Link href="/agent">Agent à budget plafonné</Link></li>
      </ul>
    </section>
  );
}
