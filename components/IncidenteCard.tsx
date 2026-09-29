"use client";

// Cartão de incidente do Vigia (Requirements 6.2, 6.3, 6.4, 6.5).
// Mostra o resumo do incidente na lista e, quando expandido, o detalhe do
// diagnóstico de forma legível: confiança como etiqueta (baixa = cinza,
// média = âmbar, alta = laranja do Rui), arquivos suspeitos em lista
// monoespaçada com motivo e PR relacionado como link.
// As ações (mudar status, diagnosticar) são delegadas ao pai.

// --- Tipos das respostas de /api/incidentes ---

export type ArquivoSuspeito = {
  caminho: string;
  motivo: string;
};

export type Diagnostico = {
  resumo: string;
  causa_provavel: string;
  confianca: "baixa" | "media" | "alta";
  arquivos_suspeitos: ArquivoSuspeito[];
  pr_relacionado: string | null;
  impacto: string;
  proximo_passo: string;
  corrigivel_automaticamente: boolean;
  motivo: string;
};

// Item da lista (sem o diagnóstico, que é pesado; vem só no detalhe).
export type IncidenteLista = {
  id: number;
  sentry_issue_id: string;
  projeto: string;
  titulo: string;
  nivel: string | null;
  url: string | null;
  ocorrencias: number;
  usuarios_afetados: number;
  primeira_vez: string;
  ultima_vez: string;
  status: string;
  diagnostico_iniciado_em: string | null;
  diagnosticado_em: string | null;
  criado_em: string;
};

// Detalhe completo (traz culpado, release, ambiente, stack e diagnóstico).
export type IncidenteDetalhe = IncidenteLista & {
  culpado: string | null;
  release: string | null;
  ambiente: string | null;
  stack: unknown;
  diagnostico: Diagnostico | null;
};

// Rótulos e cor de cada status.
const STATUS_ROTULO: Record<string, string> = {
  aberto: "Aberto",
  diagnosticado: "Diagnosticado",
  resolvido: "Resolvido",
  ignorado: "Ignorado",
};

// Cor da etiqueta de confiança (design.md): baixa = cinza, média = âmbar,
// alta = laranja do Rui.
const CONFIANCA: Record<
  Diagnostico["confianca"],
  { rotulo: string; cor: string }
> = {
  baixa: { rotulo: "Confiança baixa", cor: "var(--texto-secundario)" },
  media: { rotulo: "Confiança média", cor: "var(--espera)" },
  alta: { rotulo: "Confiança alta", cor: "#FF7A59" },
};

function dataHora(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(iso);
  }
}

function Etiqueta({
  texto,
  cor,
  fundoTransparente = true,
}: {
  texto: string;
  cor: string;
  fundoTransparente?: boolean;
}) {
  return (
    <span
      className="mono"
      style={{
        fontSize: "11px",
        padding: "2px 8px",
        borderRadius: "10px",
        border: `1px solid ${cor}`,
        color: cor,
        background: fundoTransparente ? "transparent" : cor,
        whiteSpace: "nowrap",
      }}
    >
      {texto}
    </span>
  );
}

function DetalheDiagnostico({ diag }: { diag: Diagnostico }) {
  const confianca = CONFIANCA[diag.confianca] ?? CONFIANCA.baixa;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <div>
        <Etiqueta texto={confianca.rotulo} cor={confianca.cor} />
      </div>

      <div>
        <span className="texto-secundario">Resumo: </span>
        <span>{diag.resumo}</span>
      </div>

      <div>
        <span className="texto-secundario">Causa provável: </span>
        <span>{diag.causa_provavel}</span>
      </div>

      {diag.arquivos_suspeitos && diag.arquivos_suspeitos.length > 0 && (
        <div>
          <span className="texto-secundario">Arquivos suspeitos:</span>
          <ul style={{ margin: "6px 0 0", paddingLeft: "18px" }}>
            {diag.arquivos_suspeitos.map((a, i) => (
              <li key={i} style={{ marginBottom: "4px" }}>
                <span className="mono" style={{ fontSize: "13px" }}>
                  {a.caminho}
                </span>
                {a.motivo && (
                  <span className="texto-secundario"> — {a.motivo}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {diag.pr_relacionado && (
        <div>
          <span className="texto-secundario">PR relacionado: </span>
          {diag.pr_relacionado.startsWith("http") ? (
            <a
              href={diag.pr_relacionado}
              target="_blank"
              rel="noreferrer"
              className="mono"
              style={{ fontSize: "13px" }}
            >
              {diag.pr_relacionado}
            </a>
          ) : (
            <span className="mono" style={{ fontSize: "13px" }}>
              {diag.pr_relacionado}
            </span>
          )}
        </div>
      )}

      {diag.impacto && (
        <div>
          <span className="texto-secundario">Impacto: </span>
          <span>{diag.impacto}</span>
        </div>
      )}

      {diag.proximo_passo && (
        <div>
          <span className="texto-secundario">Próximo passo: </span>
          <span>{diag.proximo_passo}</span>
        </div>
      )}

      <div className="texto-secundario" style={{ fontSize: "13px" }}>
        {diag.corrigivel_automaticamente
          ? "Correção automática possível (fase futura)."
          : "Correção automática não permitida."}
        {diag.motivo ? ` ${diag.motivo}` : ""}
      </div>
    </div>
  );
}

export default function IncidenteCard({
  incidente,
  detalhe,
  aberto,
  ocupado = false,
  onAbrir,
  onStatus,
  onDiagnosticar,
}: {
  incidente: IncidenteLista;
  // Detalhe carregado sob demanda quando o cartão está aberto.
  detalhe?: IncidenteDetalhe | null;
  aberto: boolean;
  ocupado?: boolean;
  onAbrir: (id: number) => void;
  onStatus: (id: number, status: "resolvido" | "ignorado") => void;
  onDiagnosticar: (id: number) => void;
}) {
  const ehAberto = incidente.status === "aberto";
  const naFila = ehAberto && incidente.diagnostico_iniciado_em == null;
  const statusRotulo =
    STATUS_ROTULO[incidente.status] ?? incidente.status;

  return (
    <div
      className="painel"
      style={{
        padding: "14px 16px",
        borderLeft: `3px solid ${
          ehAberto ? "#FF7A59" : "var(--borda-forte)"
        }`,
        display: "flex",
        flexDirection: "column",
        gap: "10px",
      }}
    >
      <button
        type="button"
        onClick={() => onAbrir(incidente.id)}
        aria-expanded={aberto}
        style={{
          all: "unset",
          cursor: "pointer",
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          minHeight: "auto",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: "12px",
          }}
        >
          <span className="titulo-pixel" style={{ fontSize: "13px" }}>
            {incidente.titulo}
          </span>
          <Etiqueta
            texto={statusRotulo}
            cor={ehAberto ? "#FF7A59" : "var(--texto-secundario)"}
          />
        </div>

        <div
          className="texto-secundario"
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "12px",
            fontSize: "13px",
          }}
        >
          <span>Projeto: {incidente.projeto}</span>
          {incidente.nivel && <span>Nível: {incidente.nivel}</span>}
          <span>Ocorrências: {incidente.ocorrencias}</span>
          <span>Usuários afetados: {incidente.usuarios_afetados}</span>
          <span className="mono">
            Última vez: {dataHora(incidente.ultima_vez)}
          </span>
        </div>
      </button>

      {aberto && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "12px",
            borderTop: "1px solid var(--borda)",
            paddingTop: "12px",
          }}
        >
          {detalhe === undefined ? (
            <p className="texto-secundario" style={{ margin: 0 }}>
              Carregando detalhe…
            </p>
          ) : detalhe && detalhe.diagnostico ? (
            <DetalheDiagnostico diag={detalhe.diagnostico} />
          ) : (
            <p className="texto-secundario" style={{ margin: 0 }}>
              {naFila
                ? "Ainda sem diagnóstico. Use “Diagnosticar agora”."
                : "Sem diagnóstico disponível."}
            </p>
          )}

          {incidente.url && (
            <div>
              <a href={incidente.url} target="_blank" rel="noreferrer">
                Abrir no Sentry
              </a>
            </div>
          )}

          {/* Ações (Requirements 6.4, 6.5). */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            {naFila && (
              <button
                type="button"
                className="botao-destaque"
                disabled={ocupado}
                onClick={() => onDiagnosticar(incidente.id)}
              >
                Diagnosticar agora
              </button>
            )}
            <button
              type="button"
              className="botao"
              disabled={ocupado || incidente.status === "resolvido"}
              onClick={() => onStatus(incidente.id, "resolvido")}
            >
              Marcar como resolvido
            </button>
            <button
              type="button"
              className="botao"
              disabled={ocupado || incidente.status === "ignorado"}
              onClick={() => onStatus(incidente.id, "ignorado")}
            >
              Ignorar
            </button>
            {/* Requirement 6.5: visível e desabilitado, com o texto "em breve". */}
            <button type="button" disabled aria-disabled="true">
              Propor correção · em breve
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
