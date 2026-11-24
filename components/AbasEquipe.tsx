"use client";

// Abas da área de agentes: "Equipe" (canvas + configuração), "Planta" (o Escritório) e "Incidentes" (falhas que o
// Vigia achou, com o contador de abertos).
import Link from "next/link";
import { useEffect, useState } from "react";
import { obter } from "../lib/api";

type Aba = "equipe" | "planta" | "incidentes";
const ABAS: { chave: Aba; href: string; rotulo: string }[] = [
  { chave: "equipe", href: "/agentes", rotulo: "Equipe" },
  { chave: "planta", href: "/escritorio", rotulo: "Planta" },
  { chave: "incidentes", href: "/incidentes", rotulo: "Incidentes" },
];

export default function AbasEquipe({ ativa }: { ativa: Aba }) {
  const [abertos, setAbertos] = useState(0);
  useEffect(() => {
    obter<{ abertos: number }>("/incidentes/resumo")
      .then((r) => setAbertos(typeof r?.abertos === "number" ? r.abertos : 0))
      .catch(() => {});
  }, []);
  return (
    <nav className="ag-abas" aria-label="Visões dos agentes">
      {ABAS.map((a) => (
        <Link key={a.chave} href={a.href} className={`ag-aba${ativa === a.chave ? " ativa" : ""}`} aria-current={ativa === a.chave ? "page" : undefined}>
          {a.rotulo}
          {a.chave === "incidentes" && abertos > 0 && (
            <span className="hq-contador perigo mono" aria-label={`${abertos} abertos`}>
              {abertos}
            </span>
          )}
        </Link>
      ))}
    </nav>
  );
}
