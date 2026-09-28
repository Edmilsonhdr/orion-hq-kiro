// Wrapper de fetch para as rotas /api/*.
// Ao receber 401, redireciona para /login (Requirement 1.4).

export class ErroApi extends Error {
  status: number;

  constructor(status: number, mensagem: string) {
    super(mensagem);
    this.name = "ErroApi";
    this.status = status;
  }
}

function redirecionarParaLogin() {
  if (typeof window !== "undefined" && window.location.pathname !== "/login") {
    window.location.href = "/login";
  }
}

async function requisitar<T>(caminho: string, init?: RequestInit): Promise<T> {
  const resposta = await fetch(`/api${caminho}`, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  if (resposta.status === 401) {
    redirecionarParaLogin();
    throw new ErroApi(401, "Sessão expirada");
  }

  if (!resposta.ok) {
    let mensagem = `Erro ${resposta.status}`;
    try {
      const corpo = await resposta.json();
      if (corpo?.detail) mensagem = String(corpo.detail);
    } catch {
      // resposta sem JSON: mantém a mensagem padrão
    }
    throw new ErroApi(resposta.status, mensagem);
  }

  if (resposta.status === 204) {
    return undefined as T;
  }

  return (await resposta.json()) as T;
}

export function obter<T>(caminho: string): Promise<T> {
  return requisitar<T>(caminho, { method: "GET" });
}

export function enviar<T>(caminho: string, dados?: unknown): Promise<T> {
  return requisitar<T>(caminho, {
    method: "POST",
    body: dados === undefined ? undefined : JSON.stringify(dados),
  });
}
