"use client";

// Carrega o cadastro de agentes (GET /api/agentes) uma vez por sessão do menu e aplica em lib/agents.ts,
// para as telas mostrarem nomes/cores editados e os agentes criados na tela. Se a API falhar, segue
// com os padrões do código (as telas nunca dependem do cadastro para abrir).
import { useEffect, useState, type ReactNode } from "react";
import { obter } from "../lib/api";
import { aplicarCadastro, type CadastroAgente } from "../lib/agents";

export default function CadastroAgentes({ children }: { children: ReactNode }) {
  const [pronto, setPronto] = useState(false);
  useEffect(() => {
    let ativo = true;
    obter<{ agentes: CadastroAgente[] }>("/agentes")
      .then((r) => aplicarCadastro(r.agentes))
      .catch(() => undefined)
      .finally(() => ativo && setPronto(true));
    return () => {
      ativo = false;
    };
  }, []);
  return pronto ? <>{children}</> : null;
}
