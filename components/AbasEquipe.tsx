"use client";

// Abas da área de agentes: "Equipe" (canvas + configuração) e "Planta" (o Escritório).
import Link from "next/link";

export default function AbasEquipe({ ativa }: { ativa: "equipe" | "planta" }) {
  return (
    <nav className="ag-abas" aria-label="Visões dos agentes">
      <Link href="/agentes" className={`ag-aba${ativa === "equipe" ? " ativa" : ""}`} aria-current={ativa === "equipe" ? "page" : undefined}>
        Equipe
      </Link>
      <Link href="/escritorio" className={`ag-aba${ativa === "planta" ? " ativa" : ""}`} aria-current={ativa === "planta" ? "page" : undefined}>
        Planta
      </Link>
    </nav>
  );
}
