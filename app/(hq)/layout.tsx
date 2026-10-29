// Layout autenticado do grupo (hq) (Requirements 1.4, 9.2).
// O menu lateral (client) checa a sessão via GET /api/me — se 401, o wrapper de lib/api.ts redireciona
// para /login — e mostra a navegação, os contadores e a ação de sair. Aqui só montamos a estrutura
// (menu à esquerda, conteúdo à direita; no celular o menu vira barra no topo).

import Header from "../../components/Header";

export default function LayoutHq({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="hq-app">
      <Header />
      <main className="hq-conteudo">{children}</main>
    </div>
  );
}
